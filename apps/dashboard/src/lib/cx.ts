import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge Tailwind classes with clsx + tailwind-merge (dedupe conflicts). */
export function cx(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
