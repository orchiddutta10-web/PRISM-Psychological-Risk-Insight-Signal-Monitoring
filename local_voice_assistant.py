import os
import sys
import json
import time
import subprocess
import numpy as np

# Audio configuration (Required by openWakeWord & Vosk)
FORMAT_SAMPLE_WIDTH = 2       # 16-bit signed PCM (2 bytes)
CHANNELS = 1                  # Mono
RATE = 16000                  # 16 kHz sample rate
CHUNK_SIZE = 1280             # 80ms chunks at 16kHz (openWakeWord default chunk size)

# Resolve the absolute directory this script lives in (e.g. /home/orchid/C)
# This ensures all paths work correctly regardless of the terminal's working directory.
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Model paths — resolved to absolute paths
VOSK_MODEL_PATH  = os.environ.get("VOSK_MODEL_PATH",  os.path.join(_BASE_DIR, "models", "vosk-model-small-en-us-0.15"))
PIPER_MODEL_PATH = os.environ.get("PIPER_MODEL_PATH", os.path.join(_BASE_DIR, "models", "en_US-lessac-medium.onnx"))
PIPER_EXE_PATH   = os.environ.get("PIPER_EXE_PATH",   os.path.join(_BASE_DIR, "piper", "piper"))

class LocalVoiceAssistant:
    """
    Local voice assistant pipeline running Wake-Word Detection (openWakeWord),
    offline Speech-to-Text (Vosk), and fast local Text-to-Speech (Piper).
    """
    def __init__(self, wake_word="alexa", threshold=0.5):
        self.wake_word = wake_word
        self.threshold = threshold
        self.audio = None
        self.stream = None
        self.oww_model = None
        self.vosk_model = None
        self.vosk_recognizer = None
        
        print("🤖 Initializing Local Voice Assistant Pipeline...")
        self._setup_voice_out()
        self._setup_audio_in()
        self._setup_wakeword()
        self._setup_stt()
        
    def _setup_voice_out(self):
        """Verify Piper configuration."""
        print(" -> Checking Text-to-Speech (Piper)...")
        # Ensure Piper model exists or warn
        if not os.path.exists(PIPER_MODEL_PATH):
            print(f"   [!] WARNING: Piper ONNX model not found at '{PIPER_MODEL_PATH}'.")
            print("       Make sure to download the .onnx and .onnx.json files.")

    def _setup_audio_in(self):
        """Sets up microphone stream via PyAudio or SoundDevice."""
        print(" -> Setting up Microphone stream...")
        try:
            import pyaudio
            self.audio = pyaudio.PyAudio()
            
            # Find default input device index
            try:
                default_device = self.audio.get_default_input_device_info()
                print(f"    Connected to Input Device: {default_device['name']}")
            except IOError:
                print("    [!] No default input device found.")
                
            self.stream = self.audio.open(
                format=pyaudio.paInt16,
                channels=CHANNELS,
                rate=RATE,
                input=True,
                frames_per_buffer=CHUNK_SIZE
            )
            self.use_pyaudio = True
        except ImportError:
            print("    PyAudio not installed. Trying sounddevice fallback...")
            try:
                import sounddevice as sd
                self.use_pyaudio = False
                print("    Connected to SoundDevice microphone.")
            except ImportError:
                print("    [!] WARNING: Neither PyAudio nor SoundDevice found. Running in CLI simulation mode.")
                self.stream = None

    def _setup_wakeword(self):
        """Loads openWakeWord engine."""
        if not self.stream:
            return
            
        print(" -> Initializing openWakeWord...")
        try:
            from openwakeword.model import Model
            # Load default models or custom model paths
            self.oww_model = Model(
                wakeword_models=[self.wake_word],
                inference_framework="tflite"
            )
            print(f"    Loaded Wake Word: '{self.wake_word}' (Threshold: {self.threshold})")
        except Exception as e:
            print(f"    [!] Error loading openWakeWord: {str(e)}")
            print("    Falling back to keyboard-trigger mode.")
            self.oww_model = None

    def _setup_stt(self):
        """Loads offline Vosk model."""
        if not self.stream:
            return
            
        print(" -> Loading Vosk Speech-to-Text model...")
        try:
            from vosk import Model as VoskModel, KaldiRecognizer
            if not os.path.exists(VOSK_MODEL_PATH):
                print(f"   [!] Vosk model directory '{VOSK_MODEL_PATH}' not found.")
                print("       Download from https://alphacephei.com/vosk/models and extract it.")
                self.vosk_model = None
                return
                
            self.vosk_model = VoskModel(VOSK_MODEL_PATH)
            self.vosk_recognizer = KaldiRecognizer(self.vosk_model, RATE)
            print("    Vosk model successfully loaded.")
        except Exception as e:
            print(f"    [!] Error loading Vosk: {str(e)}")
            self.vosk_model = None

    def speak(self, text: str):
        """
        Synthesizes speech using Piper TTS and plays it back.
        Uses command-line pipe: Echo Text -> Piper -> (pacat or aplay)
        Supports PulseAudio (pacat) natively and falls back to ALSA (aplay).
        """
        print(f"🔊 Assistant: \"{text}\"")
        
        if not os.path.exists(PIPER_MODEL_PATH):
            print("    [TTS Offline] Cannot speak: Piper ONNX model missing.")
            return

        try:
            # 1. Start Piper process
            piper_cmd = [
                PIPER_EXE_PATH,
                "--model", PIPER_MODEL_PATH,
                "--output-raw"
            ]
            piper_proc = subprocess.Popen(
                piper_cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL
            )
            
            # 2. Check if PulseAudio's pacat utility is available in system PATH
            # If pacat is available, use it to stream to PulseAudio. Otherwise, fall back to ALSA aplay.
            use_pulseaudio = False
            try:
                subprocess.run(["which", "pacat"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
                use_pulseaudio = True
            except subprocess.CalledProcessError:
                pass
                
            if use_pulseaudio:
                # pacat playback command for raw 22050Hz 16-bit mono PCM
                play_cmd = [
                    "pacat",
                    "--playback",
                    "--rate=22050",
                    "--format=s16le",
                    "--channels=1"
                ]
            else:
                # ALSA fallback
                play_cmd = [
                    "aplay",
                    "-r", "22050",
                    "-f", "S16_LE",
                    "-c", "1",
                    "-t", "raw"
                ]
                
            play_proc = subprocess.Popen(
                play_cmd,
                stdin=piper_proc.stdout,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            
            # 3. Feed text into Piper
            piper_proc.stdin.write(text.encode('utf-8'))
            piper_proc.stdin.flush()
            piper_proc.stdin.close()
            
            # Wait for playback to finish
            play_proc.wait()
            piper_proc.wait()
            
        except Exception as e:
            print(f"    [!] TTS playback error: {str(e)}")

    def listen_and_transcribe(self, timeout_sec=5.0) -> str:
        """
        Captures audio from the mic stream and transcribes it using Vosk
        until a pause/silence is detected or timeout is reached.
        """
        if not self.vosk_recognizer or not self.stream:
            # CLI Mock Ingestion
            print("\n🎤 [Listening...] (Type your command and press Enter):")
            return input("> ")

        print("🎤 Listening for command...")
        start_time = time.time()
        self.vosk_recognizer.Reset()
        
        while time.time() - start_time < timeout_sec:
            # Read chunk from mic
            if self.use_pyaudio:
                data = self.stream.read(CHUNK_SIZE, exception_on_overflow=False)
            else:
                import sounddevice as sd
                data, _ = sd.RawInputStream.read(CHUNK_SIZE)
                data = bytes(data)

            # Feed to Vosk
            if self.vosk_recognizer.AcceptWaveform(data):
                res = json.loads(self.vosk_recognizer.Result())
                if res['text']:
                    return res['text']
                    
        # Check partial result on timeout
        partial = json.loads(self.vosk_recognizer.FinalResult())
        return partial.get('text', '')

    def run(self):
        """Main execution loop (State Machine)."""
        print("\n🚀 Voice Assistant Loop Active.")
        
        # Check if we are running in CLI simulation mode
        if not self.stream or not self.oww_model:
            print("ℹ️  Running in CLI Mock Mode. Press Enter to simulate Wake Word detection.")
            while True:
                try:
                    input("\n[Press Enter to Trigger Wake Word]")
                    print("🔔 Wake Word detected!")
                    self.speak("How can I help you?")
                    command = self.listen_and_transcribe()
                    print(f"📝 Transcribed Command: \"{command}\"")
                    self.handle_command(command)
                except KeyboardInterrupt:
                    print("\nShutting down voice assistant...")
                    break
            return

        # Real Hardware streaming loop
        print("👂 Continuous listening for Wake Word...")
        while True:
            try:
                # Read mic audio
                if self.use_pyaudio:
                    data = self.stream.read(CHUNK_SIZE, exception_on_overflow=False)
                else:
                    import sounddevice as sd
                    data, _ = sd.RawInputStream.read(CHUNK_SIZE)
                    data = bytes(data)
                    
                # Convert buffer to numpy array for openWakeWord
                audio_np = np.frombuffer(data, dtype=np.int16)
                
                # Predict wake word presence
                self.oww_model.predict(audio_np)
                
                # Check prediction confidence
                prediction = self.oww_model.prediction_accumulators[self.wake_word]
                if len(prediction) > 0 and prediction[-1] > self.threshold:
                    print(f"\n🔔 Detected Wake Word '{self.wake_word}'! (Confidence: {prediction[-1]:.2f})")
                    
                    # Play voice confirmation
                    self.speak("Yes?")
                    
                    # Listen for user command
                    command = self.listen_and_transcribe(timeout_sec=5.0)
                    print(f"📝 Command text: \"{command}\"")
                    
                    if command.strip():
                        self.handle_command(command)
                    else:
                        print("💨 No command detected (silence/timeout).")
                        
                    print("\n👂 Resuming Wake Word monitoring...")
                    # Clear openWakeWord history to prevent double triggers
                    self.oww_model.reset()
                    
            except KeyboardInterrupt:
                print("\nStopping voice assistant loop...")
                break
            except Exception as e:
                print(f"[!] Error in audio loop: {e}")
                time.sleep(0.5)

        # Cleanup
        if self.stream:
            self.stream.stop_stream()
            self.stream.close()
        if self.audio:
            self.audio.terminate()

    def handle_command(self, command: str):
        """Processes the recognized text command and acts."""
        command = command.lower()
        
        # Simple intent matching
        if "stress" in command or "how am i" in command:
            self.speak("Checking your biosensor status. Please hold.")
            # Interface with SentinelMind services:
            try:
                from app.services.sensor_service import SensorService
                from app.services.ml_service import MLService
                from app.ml.feature_extractor import extract_gsr_features, extract_hrv_features, compile_model_features
                
                sensor_service = SensorService()
                ml_service = MLService()
                
                # Fetch recent buffer
                history = sensor_service.get_buffered_readings(count=30)
                if len(history) < 5:
                    for _ in range(30):
                        sensor_service.get_latest_reading()
                    history = sensor_service.get_buffered_readings(count=30)
                    
                gsr_vals = np.array([r["gsr_microsiemens"] for r in history])
                ibi_vals = np.array([r["inter_beat_interval_ms"] for r in history])
                
                gsr_feat = extract_gsr_features(gsr_vals)
                hrv_feat = extract_hrv_features(ibi_vals)
                feats = compile_model_features(gsr_feat, hrv_feat)
                
                pred = ml_service.predict_state(feats)
                state = pred["predicted_state"]
                confidence = int(pred["confidence"] * 100)
                
                if state == "REST":
                    self.speak(f"Your biometric indicators are normal. You appear to be relaxed. Stress prediction index is low.")
                elif state == "STRESSED":
                    self.speak(f"Alert. I detected signs of elevated stress. Your heart rate is high and heart rate variability is low. Take a deep breath.")
                elif state == "EXCITED":
                    self.speak(f"I notice high physiological arousal. You seem excited or active.")
            except Exception as e:
                self.speak("Biosensor analysis engine is currently offline. However, your mock stress levels appear stable.")
                
        elif "heart rate" in command or "pulse" in command or "bpm" in command:
            try:
                from app.services.sensor_service import SensorService
                sensor_service = SensorService()
                data = sensor_service.get_latest_reading()
                bpm = int(data["heart_rate_bpm"])
                self.speak(f"Your current heart rate is {bpm} beats per minute.")
            except Exception:
                self.speak("I am currently unable to read your pulse rate.")
                
        elif "hello" in command or "hi" in command:
            self.speak("Hello. I am Sentinel, your local physiological monitoring assistant.")
            
        elif "exit" in command or "terminate" in command or "turn off" in command:
            self.speak("Shutting down voice system. Goodbye.")
            sys.exit(0)
            
        else:
            self.speak(f"I received your command: {command}. However, I do not have an action mapped for it.")

if __name__ == '__main__':
    # Initialize assistant
    # To run on actual hardware:
    # 1. Download Vosk small model and extract to ./models/vosk-model-small-en-us-0.15
    # 2. Download Piper ONNX file and voice.json to ./models/en_US-lessac-medium.onnx
    # 3. Ensure 'piper' and 'aplay' are installed in the path.
    assistant = LocalVoiceAssistant(wake_word="alexa", threshold=0.6)
    assistant.run()
