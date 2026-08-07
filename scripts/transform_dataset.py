#!/usr/bin/env python3
"""
Script to process a large CSV dataset row-by-row using Google Gemini API for CBT-styled responses.
"""

import os
import sys
import csv
import json
import time
import logging
from datetime import datetime

from dotenv import load_dotenv
from tqdm import tqdm
from tenacity import (
    retry,
    stop_after_attempt,
    wait_random_exponential,
    retry_if_exception_type,
    before_sleep_log,
)

from google import genai
from google.genai import types
from google.api_core.exceptions import (
    ResourceExhausted,
    TooManyRequests,
    ServiceUnavailable,
)

# =======================
# Configuration Constants
# =======================
MODEL_NAME = "gemini-2.0-flash"  # Changed to the correct available model
INPUT_FILE = r"C:\Users\deban\Downloads\archive\ai-medical-chatbot.csv"
OUTPUT_FILE = "output.csv"
CHECKPOINT_FILE = "checkpoint.json"
ERROR_FILE = "errors.csv"
REQUEST_DELAY = 5.0  # seconds to wait between requests (to mitigate rate limits)
MAX_RETRIES = 5
TEMPERATURE = 0.7
MAX_OUTPUT_TOKENS = 300

# System instruction for Gemini (PRISM CBT Coach)
SYSTEM_INSTRUCTION = (
    "You are PRISM, a warm, empathetic, and encouraging cognitive-behavioral (CBT) coach. "
    "You provide supportive, evidence-informed guidance and encouragement. "
    "Your style is positive, non-judgmental, and focused on helping the person manage their feelings. "
    "Never diagnose conditions, prescribe medication, or claim to be a licensed therapist. "
    "Emphasize coping strategies, cognitive reframing, and emotional support. "
    "If needed, encourage seeking professional help, but do not act as a therapist yourself. "
    "Keep responses generally between 80 and 180 words unless the situation clearly requires more detail."
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def load_api_key():
    """Load Gemini API key from environment using dotenv."""
    load_dotenv("services/api/.env")
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.error("GEMINI_API_KEY not found in environment")
        sys.exit(1)
    return api_key


def init_gemini_client(api_key: str):
    """Initialize the Google Gen AI Gemini client with the provided API key."""
    genai_client = genai.Client(api_key=api_key)
    return genai_client


# Define retry conditions for API calls
retry_exceptions = (
    ResourceExhausted,
    TooManyRequests,
    ServiceUnavailable,
    # Include generic exceptions for transient network issues
    Exception,
)


@retry(
    reraise=True,
    wait=wait_random_exponential(multiplier=1, max=60),
    stop=stop_after_attempt(MAX_RETRIES),
    retry=retry_if_exception_type(retry_exceptions),
    before_sleep=before_sleep_log(logger, logging.WARNING),
)
def call_gemini(client: genai.Client, text: str) -> str:
    """
    Call the Gemini API to generate a CBT-style response for the given text.
    Retries on transient errors using tenacity.
    """
    # Prepare the generation configuration with system instruction
    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_INSTRUCTION,
        temperature=TEMPERATURE,
        max_output_tokens=MAX_OUTPUT_TOKENS,
    )
    # Generate content via Gemini
    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=text,
        config=config,
    )
    return response.text


def main():
    # Load API key and initialize Gemini client
    api_key = load_api_key()
    client = init_gemini_client(api_key)

    # Count total rows for progress bar (subtract header)
    try:
        with open(INPUT_FILE, "r", encoding="utf-8") as f_in:
            total_lines = sum(1 for _ in f_in) - 1
    except Exception as e:
        logger.error(f"Failed to count lines in input file: {e}")
        total_lines = None

    # Prepare output CSV: write header if file does not exist
    output_exists = os.path.exists(OUTPUT_FILE)
    out_file = open(OUTPUT_FILE, mode="a", newline="", encoding="utf-8")
    writer = None
    # Prepare error CSV: write header if file does not exist
    error_exists = os.path.exists(ERROR_FILE)
    err_file = open(ERROR_FILE, mode="a", newline="", encoding="utf-8")
    err_writer = csv.writer(err_file)
    if not error_exists:
        err_writer.writerow(
            ["row_number", "patient_text", "error_type", "error_message", "timestamp"]
        )

    # Load or initialize checkpoint
    last_processed = 0
    if os.path.exists(CHECKPOINT_FILE):
        try:
            with open(CHECKPOINT_FILE, "r", encoding="utf-8") as cp:
                data = json.load(cp)
                last_processed = int(data.get("last_processed", 0))
        except Exception as e:
            logger.warning(
                f"Could not read checkpoint file, starting from scratch: {e}"
            )
            last_processed = 0

    # Open input file for streaming read
    with open(INPUT_FILE, "r", encoding="utf-8", newline="") as f_in:
        reader = csv.DictReader(f_in)
        # Setup CSV writer with new column
        fieldnames = (
            reader.fieldnames + ["CBT_Coach"]
            if reader.fieldnames
            else ["Patient", "CBT_Coach"]
        )
        writer = csv.DictWriter(out_file, fieldnames=fieldnames)
        if not output_exists:
            writer.writeheader()

        # Skip already processed rows
        current_index = 0
        for _ in range(last_processed):
            try:
                next(reader)
                current_index += 1
            except StopIteration:
                break

        # Initialize progress bar
        if total_lines:
            pbar = tqdm(
                total=total_lines, initial=last_processed, desc="Processing rows"
            )
        else:
            pbar = tqdm(desc="Processing rows")

        success_count = 0
        failed_count = 0
        row_number = last_processed
        try:
            for row_number, row in enumerate(reader, start=last_processed + 1):
                patient_text = row.get("Patient", "")
                # Delay to avoid hitting rate limits
                if REQUEST_DELAY and REQUEST_DELAY > 0:
                    time.sleep(REQUEST_DELAY)
                try:
                    # Call Gemini API
                    reply = call_gemini(client, patient_text)
                    # Append response to row and write to output CSV
                    row["CBT_Coach"] = reply
                    writer.writerow(row)
                    out_file.flush()
                    success_count += 1
                except Exception as e:
                    # Log error details
                    err_type = type(e).__name__
                    err_msg = str(e).replace("\n", " ")
                    timestamp = datetime.now().isoformat()
                    err_writer.writerow(
                        [row_number, patient_text, err_type, err_msg, timestamp]
                    )
                    err_file.flush()
                    failed_count += 1
                finally:
                    # Update checkpoint after each row
                    try:
                        with open(CHECKPOINT_FILE, "w", encoding="utf-8") as cp:
                            json.dump({"last_processed": row_number}, cp)
                    except Exception as e:
                        logger.error(f"Failed to write checkpoint: {e}")
                # Update progress bar
                pbar.update(1)
                pbar.set_postfix(success=success_count, failed=failed_count)
        except KeyboardInterrupt:
            logger.info("Interrupted by user (Ctrl+C). Exiting gracefully.")
        finally:
            pbar.close()

    # Clean up
    out_file.close()
    err_file.close()
    # Removed client.close() here


if __name__ == "__main__":
    main()
