import { Moon, Sun, Smartphone, MapPin, Keyboard } from 'lucide-react'

/* ─────────────────────────────────────────────────────────────
   DEMO DATA — realistic, non-alarming baseline values
───────────────────────────────────────────────────────────── */
export const DEVICES = [
  {
    id: 'dev-001', name: "Aarav's iPhone", initials: 'AA', childAge: 14,
    platform: 'iOS', lastSeen: '2 min ago', riskScore: 34, riskLabel: 'Normal Range',
    status: 'active' as const, concern: 'Screen Time & App Usage',
    signals: [
      { label: 'Screen Time', icon: Smartphone, baseline: 180, actual: 210, unit: 'min/day', delta: +17 },
      { label: 'Bedtime', icon: Moon, baseline: 22.0, actual: 22.5, unit: 'hr', delta: +2 },
      { label: 'Daily Steps', icon: MapPin, baseline: 6200, actual: 5900, unit: 'steps', delta: -5 },
      { label: 'Typing Pace', icon: Keyboard, baseline: 100, actual: 97, unit: 'WPM', delta: -3 },
    ],
    weeklyData: [
      { day: 'Mon', baseline: 180, actual: 175 }, { day: 'Tue', baseline: 180, actual: 190 },
      { day: 'Wed', baseline: 180, actual: 185 }, { day: 'Thu', baseline: 180, actual: 200 },
      { day: 'Fri', baseline: 180, actual: 220 }, { day: 'Sat', baseline: 180, actual: 230 },
      { day: 'Sun', baseline: 180, actual: 210 },
    ],
  },
  {
    id: 'dev-002', name: "Priya's Android", initials: 'PR', childAge: 16,
    platform: 'Android', lastSeen: '11 min ago', riskScore: 61, riskLabel: 'Mild Deviation',
    status: 'idle' as const, concern: 'Sleep Disruption',
    signals: [
      { label: 'Screen Time', icon: Smartphone, baseline: 150, actual: 290, unit: 'min/day', delta: +93 },
      { label: 'Bedtime', icon: Moon, baseline: 22.5, actual: 24.5, unit: 'hr', delta: +9 },
      { label: 'Daily Steps', icon: MapPin, baseline: 7000, actual: 3100, unit: 'steps', delta: -56 },
      { label: 'Typing Pace', icon: Keyboard, baseline: 95, actual: 78, unit: 'WPM', delta: -18 },
    ],
    weeklyData: [
      { day: 'Mon', baseline: 150, actual: 160 }, { day: 'Tue', baseline: 150, actual: 180 },
      { day: 'Wed', baseline: 150, actual: 210 }, { day: 'Thu', baseline: 150, actual: 240 },
      { day: 'Fri', baseline: 150, actual: 275 }, { day: 'Sat', baseline: 150, actual: 310 },
      { day: 'Sun', baseline: 150, actual: 290 },
    ],
  },
]

export interface AlertItem {
  id: string
  severity: 'low' | 'medium' | 'high'
  title: string
  summary: string
  factors: string[]
  device: string
  time: string
  read: boolean
}

export const INITIAL_ALERTS: AlertItem[] = [
  {
    id: 'a1', severity: 'medium', title: 'Late-Night Screen Activity',
    summary: "Priya's device showed 2.5h of usage between 11 PM–1:30 AM — later than her usual 10:30 PM bedtime.",
    factors: ['Screen time 93% above 7-day baseline', 'Bedtime shifted by +2 hours', 'Movement entropy dropped sharply'],
    device: "Priya's Android", time: '2h ago', read: false,
  },
  {
    id: 'a2', severity: 'low', title: 'Reduced Daily Movement',
    summary: "Priya's step count (3,100) was 56% below her usual 7,000-step daily average over 3 consecutive days.",
    factors: ['Steps 56% below rolling baseline', 'Home location stationary for 9+ hours'],
    device: "Priya's Android", time: '5h ago', read: true,
  },
  {
    id: 'a3', severity: 'low', title: 'Screen Time Slightly Elevated',
    summary: "Aarav's daily screen time is ~30 min above baseline. Within expected weekend variance.",
    factors: ['Screen time +17% above baseline', 'Usage primarily social & educational apps'],
    device: "Aarav's iPhone", time: 'Yesterday', read: true,
  },
]

export const GUIDANCE_MODES = [
  { title: 'The Direct Coach', description: 'Notices the thought behind a feeling, gently offers another way to see the situation, and pushes toward one small, doable next step. Brisk, warm, action-oriented.' },
  { title: 'The Listener', description: 'Mostly reflects back what the user says and feels rather than advising. Trusts the user already has the answer inside them. Only offers an opinion if directly asked, and even then frames it as one option.' },
  { title: 'The Strategist', description: 'Focuses on "what\'s slightly better than today" instead of dissecting the past. Uses scaling questions (1–10), spots what\'s already working, and homes in on the smallest next step.' },
  { title: 'The Clinician', description: 'Asks structured questions like a clinical intake (sleep, appetite, concentration) and talks in clearer clinical-adjacent language than the others — but is the most repetitive about disclosing it\'s not a real clinician, since its tone is the one most likely to be mistaken for authority.' },
  { title: 'The Mentor', description: 'Draws out the user\'s own reasons for change rather than pushing advice, rolls with pushback instead of arguing, and occasionally reflects the user\'s own stated values back to them. Warm but willing to create a little productive friction.' },
]