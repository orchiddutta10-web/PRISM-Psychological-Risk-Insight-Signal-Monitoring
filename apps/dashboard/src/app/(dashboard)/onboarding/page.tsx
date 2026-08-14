'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Globe,
  Phone,
  ShieldCheck,
  User,
  Heart,
  Sparkles,
  Calendar,
  Activity,
  Target,
  Check,
  MessageCircle,
  Link2,
  Star,
  Bell,
  ThumbsUp
} from 'lucide-react'

const languages = [
  { id: 'english', label: 'English', subtitle: 'I prefer to use English' },
  { id: 'hindi', label: 'Hindi', subtitle: 'मैं हिंदी में बात करना चाहूँगा' },
  { id: 'hinglish', label: 'Hinglish', subtitle: 'Mixed Hindi + English for comfort' }
]

const genderOptions = [
  { id: 'daughter', label: 'Daughter' },
  { id: 'son', label: 'Son' },
  { id: 'child', label: 'Child' }
]

const focusOptions = [
  'Emotional wellbeing',
  'Sleep & routine stability',
  'Screen time balance',
  'Social confidence',
  'Academic resilience'
]

const steps = [
  'Welcome',
  'Language',
  'Phone',
  'Code',
  'Name',
  'Gender',
  'Birthday',
  'Weight',
  'Height',
  'Confirm',
  'Focus',
  'You’re ready',
  'Journey',
  'Trial',
  'WhatsApp'
]

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [language, setLanguage] = useState('english')
  const [phone, setPhone] = useState('+91 ')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [isVerified, setIsVerified] = useState(false)
  const [name, setName] = useState('')
  const [gender, setGender] = useState('daughter')
  const [day, setDay] = useState(15)
  const [month, setMonth] = useState(6)
  const [year, setYear] = useState(2012)
  const [weight, setWeight] = useState('35')
  const [height, setHeight] = useState('145')
  const [confirmed, setConfirmed] = useState(false)
  const [focus, setFocus] = useState('Emotional wellbeing')
  const [trialAccepted, setTrialAccepted] = useState(false)
  const [whatsappConnected, setWhatsappConnected] = useState(false)
  const [messageText, setMessageText] = useState('')
  const [error, setError] = useState('')

  const currentStep = steps[step - 1]

  const handleNext = () => {
    setError('')
    if (step === 1) {
      setStep(2)
      return
    }
    if (step === 2) {
      setStep(3)
      return
    }
    if (step === 3) {
      const digits = phone.replace(/\D/g, '')
      if (digits.length < 10) {
        setError('Please enter a valid phone number.')
        return
      }
      setOtpSent(true)
      setStep(4)
      return
    }
    if (step === 4) {
      if (otp.trim() !== '123456') {
        setError('Enter the code 123456 to continue.')
        return
      }
      setIsVerified(true)
      setStep(5)
      return
    }
    if (step === 5) {
      if (!name.trim()) {
        setError('Please tell us your name.')
        return
      }
      setStep(6)
      return
    }
    if (step === 6) {
      setStep(7)
      return
    }
    if (step === 7) {
      setStep(8)
      return
    }
    if (step === 8) {
      if (!weight.trim() || Number(weight) <= 0) {
        setError('Please enter a valid weight.')
        return
      }
      setStep(9)
      return
    }
    if (step === 9) {
      if (!height.trim() || Number(height) <= 0) {
        setError('Please enter a valid height.')
        return
      }
      setStep(10)
      return
    }
    if (step === 10) {
      setConfirmed(true)
      setStep(11)
      return
    }
    if (step === 11) {
      setStep(12)
      return
    }
    if (step === 12) {
      setStep(13)
      return
    }
    if (step === 13) {
      if (!trialAccepted) {
        setError('Please accept the trial offer to continue.')
        return
      }
      setStep(14)
      return
    }
    if (step === 14) {
      if (!whatsappConnected) {
        setError('Connect WhatsApp to continue.')
        return
      }
      setMessageText('Hi there! I just activated the PRISM trial to keep our family safe. Please share the setup details on WhatsApp.')
      setStep(15)
      return
    }
    if (step === 15) {
      router.push('/overview')
      return
    }
  }

  const handleBack = () => {
    setError('')
    if (step > 1) setStep(step - 1)
  }

  return (
    <div className="min-h-screen bg-prism-dark text-prism-light px-4 py-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 rounded-3xl border border-prism-navy bg-prism-card/95 p-8 shadow-2xl backdrop-blur-lg">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-prism-sage/80">Onboarding</p>
            <h1 className="text-3xl font-black tracking-tight">{currentStep}</h1>
            <p className="mt-2 text-sm text-gray-400">Step {step} of {steps.length}</p>
          </div>
          <Link href="/" className="rounded-full border border-prism-navy px-4 py-2 text-sm text-prism-light transition hover:bg-prism-navy/20">
            Back to login
          </Link>
        </div>

        {error && (
          <div className="rounded-2xl border border-prism-red bg-prism-red/10 px-5 py-4 text-sm text-prism-red">
            {error}
          </div>
        )}

        <div className="rounded-3xl border border-prism-navy bg-prism-dark p-6 shadow-inner">
          {step === 1 && (
            <div className="space-y-6 text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-prism-sage text-prism-dark">
                <ShieldCheck size={34} />
              </div>
              <div className="space-y-3">
                <p className="text-sm uppercase tracking-[0.3em] text-prism-sage/80">Welcome to PRISM</p>
                <h2 className="text-3xl font-bold">Let’s get started</h2>
                <p className="text-sm text-gray-300">Complete the setup once and use PRISM across desktop and mobile.</p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <p className="text-sm text-gray-400">Choose your preferred language for the onboarding experience.</p>
              <div className="grid gap-4 md:grid-cols-3">
                {languages.map((lang) => (
                  <button
                    key={lang.id}
                    type="button"
                    onClick={() => setLanguage(lang.id)}
                    className={`rounded-3xl border p-6 text-left transition ${language === lang.id ? 'border-prism-sage bg-prism-sage/10' : 'border-prism-navy bg-prism-dark/80 hover:border-prism-sage'}`}>
                    <div className="flex items-center gap-3">
                      <Globe size={20} />
                      <span className="text-base font-semibold">{lang.label}</span>
                    </div>
                    <p className="mt-3 text-sm text-gray-400">{lang.subtitle}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <p className="text-sm text-gray-400">Enter your phone number so we can verify your account.</p>
              <label className="block text-sm font-semibold text-prism-light">Mobile number</label>
              <div className="rounded-3xl border border-prism-navy bg-prism-dark p-3">
                <Phone className="mb-2 text-prism-sage" size={20} />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-transparent text-lg text-prism-light outline-none"
                  placeholder="+91 98765 43210"
                />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <p className="text-sm text-gray-400">We sent a code to {phone}. Enter the verification code below.</p>
              <div className="rounded-3xl border border-prism-navy bg-prism-dark p-3">
                <ShieldCheck className="mb-2 text-prism-sage" size={20} />
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="w-full bg-transparent text-lg text-prism-light outline-none"
                  placeholder="Enter code 123456"
                />
              </div>
              <p className="text-xs text-gray-500">Tip: use code <span className="font-semibold text-prism-light">123456</span> for desktop setup.</p>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-6">
              <p className="text-sm text-gray-400">What should we call you?</p>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-3xl border border-prism-navy bg-prism-dark p-4 text-lg text-prism-light outline-none"
                placeholder="Your name"
              />
            </div>
          )}

          {step === 6 && (
            <div className="space-y-6">
              <p className="text-sm text-gray-400">Tell us who you are setting this up for.</p>
              <div className="grid gap-4 md:grid-cols-3">
                {genderOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setGender(option.id)}
                    className={`rounded-3xl border p-6 text-center transition ${gender === option.id ? 'border-prism-sage bg-prism-sage/10' : 'border-prism-navy bg-prism-dark/80 hover:border-prism-sage'}`}>
                    <User size={26} />
                    <p className="mt-3 font-semibold">{option.label}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 7 && (
            <div className="space-y-6">
              <p className="text-sm text-gray-400">When is their birthday?</p>
              <div className="grid gap-4 md:grid-cols-3">
                <input
                  type="number"
                  value={day}
                  min={1}
                  max={31}
                  onChange={(e) => setDay(Number(e.target.value))}
                  className="rounded-3xl border border-prism-navy bg-prism-dark p-4 text-center text-lg text-prism-light outline-none"
                  placeholder="Day"
                />
                <input
                  type="number"
                  value={month}
                  min={1}
                  max={12}
                  onChange={(e) => setMonth(Number(e.target.value))}
                  className="rounded-3xl border border-prism-navy bg-prism-dark p-4 text-center text-lg text-prism-light outline-none"
                  placeholder="Month"
                />
                <input
                  type="number"
                  value={year}
                  min={2008}
                  max={2026}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="rounded-3xl border border-prism-navy bg-prism-dark p-4 text-center text-lg text-prism-light outline-none"
                  placeholder="Year"
                />
              </div>
            </div>
          )}

          {step === 8 && (
            <div className="space-y-6">
              <p className="text-sm text-gray-400">What is their current weight?</p>
              <div className="flex items-center gap-3 rounded-3xl border border-prism-navy bg-prism-dark p-4">
                <span className="text-2xl text-prism-sage">kg</span>
                <input
                  type="number"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="w-full bg-transparent text-3xl font-semibold text-prism-light outline-none"
                  placeholder="35"
                />
              </div>
            </div>
          )}

          {step === 9 && (
            <div className="space-y-6">
              <p className="text-sm text-gray-400">How tall are they?</p>
              <div className="flex items-center gap-3 rounded-3xl border border-prism-navy bg-prism-dark p-4">
                <span className="text-2xl text-prism-sage">cm</span>
                <input
                  type="number"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  className="w-full bg-transparent text-3xl font-semibold text-prism-light outline-none"
                  placeholder="145"
                />
              </div>
            </div>
          )}

          {step === 10 && (
            <div className="space-y-6">
              <div className="rounded-3xl border border-prism-sage bg-prism-sage/10 p-6">
                <h2 className="text-xl font-bold">Confirm height</h2>
                <p className="mt-3 text-sm text-gray-300">You entered {height} cm. This helps PRISM understand growth and wellbeing patterns.</p>
              </div>
              <div className="flex flex-col gap-3 md:flex-row">
                <button
                  type="button"
                  onClick={() => setStep(9)}
                  className="rounded-3xl border border-prism-navy bg-transparent px-5 py-3 text-sm text-prism-light transition hover:border-prism-sage"
                >
                  Edit height
                </button>
                <button
                  type="button"
                  onClick={() => { setConfirmed(true); setStep(11) }}
                  className="rounded-3xl bg-prism-sage px-5 py-3 text-sm font-semibold text-prism-dark transition hover:bg-prism-sage/90"
                >
                  Confirm {height} cm
                </button>
              </div>
            </div>
          )}

          {step === 11 && (
            <div className="space-y-6">
              <p className="text-sm text-gray-400">What is your main focus for their wellbeing?</p>
              <div className="grid gap-4 md:grid-cols-2">
                {focusOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setFocus(option)}
                    className={`rounded-3xl border p-5 text-left transition ${focus === option ? 'border-prism-sage bg-prism-sage/10' : 'border-prism-navy bg-prism-dark/80 hover:border-prism-sage'}`}>
                    <div className="flex items-center gap-3">
                      <Target size={22} />
                      <span className="font-semibold">{option}</span>
                    </div>
                    <p className="mt-3 text-sm text-gray-400">Psychological behaviour, sleep, routines and support focus.</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 12 && (
            <div className="space-y-6 text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-prism-sage text-prism-dark">
                <Sparkles size={34} />
              </div>
              <h2 className="text-3xl font-bold">You’re in the right place</h2>
              <p className="text-sm text-gray-300">PRISM will support your child’s wellbeing with a behaviour-first approach.</p>
              <div className="rounded-3xl border border-prism-navy bg-prism-dark p-6 text-left">
                <p className="font-semibold">Hello {name},</p>
                <p className="mt-2 text-sm text-gray-400">You selected {focus}. We will recommend signals and guidance around that goal.</p>
              </div>
            </div>
          )}

          {step === 13 && (
            <div className="space-y-6">
              <div className="rounded-3xl border border-prism-navy bg-prism-dark p-6">
                <h2 className="text-2xl font-bold">Your journey ahead</h2>
                <p className="mt-3 text-sm text-gray-400">PRISM will guide you through early signals, consent-first monitoring, and behaviour insights.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-3xl border border-prism-navy p-5">
                  <p className="text-sm uppercase tracking-[0.2em] text-prism-sage/70">Step 1</p>
                  <p className="mt-3 text-lg font-semibold">Baseline setup</p>
                </div>
                <div className="rounded-3xl border border-prism-navy p-5">
                  <p className="text-sm uppercase tracking-[0.2em] text-prism-sage/70">Step 2</p>
                  <p className="mt-3 text-lg font-semibold">Consented monitoring</p>
                </div>
                <div className="rounded-3xl border border-prism-navy p-5">
                  <p className="text-sm uppercase tracking-[0.2em] text-prism-sage/70">Step 3</p>
                  <p className="mt-3 text-lg font-semibold">Actionable insight</p>
                </div>
              </div>
            </div>
          )}

          {step === 14 && (
            <div className="space-y-6">
              <div className="rounded-3xl border border-prism-navy bg-prism-dark p-6">
                <div className="flex items-center gap-3">
                  <Star size={22} className="text-prism-sage" />
                  <h2 className="text-2xl font-bold">Start 7 days free trial</h2>
                </div>
                <p className="mt-3 text-sm text-gray-300">Activate your first week for just ₹10 and see PRISM in action.</p>
              </div>
              <div className="rounded-3xl border border-prism-sage bg-prism-sage/10 p-6">
                <p className="text-4xl font-bold">₹10</p>
                <p className="mt-2 text-sm text-gray-400">7-day trial with guided behavior support.</p>
              </div>
              <div className="flex flex-col gap-3 md:flex-row">
                <button
                  type="button"
                  className={`rounded-3xl px-6 py-4 text-sm font-semibold transition ${trialAccepted ? 'bg-prism-sage text-prism-dark' : 'border border-prism-navy bg-transparent text-prism-light hover:border-prism-sage'}`}
                  onClick={() => setTrialAccepted(!trialAccepted)}
                >
                  {trialAccepted ? 'Trial selected' : 'Select trial'}
                </button>
                <button
                  type="button"
                  className="rounded-3xl bg-prism-sage px-6 py-4 text-sm font-semibold text-prism-dark transition hover:bg-prism-sage/90"
                  onClick={handleNext}
                >
                  Activate trial
                </button>
              </div>
            </div>
          )}

          {step === 15 && (
            <div className="space-y-6">
              <div className="rounded-3xl border border-prism-navy bg-prism-dark p-6">
                <div className="flex items-center gap-3">
                  <MessageCircle size={22} />
                  <h2 className="text-2xl font-bold">Connect WhatsApp</h2>
                </div>
                <p className="mt-3 text-sm text-gray-400">Send a quick welcome message to your family and complete setup.</p>
              </div>
              <div className="rounded-3xl border border-prism-navy bg-prism-dark p-6">
                <p className="text-sm text-gray-400">Message preview:</p>
                <div className="mt-4 rounded-3xl border border-prism-sage bg-prism-sage/10 p-4 text-sm text-prism-dark">
                  {messageText || 'Connect WhatsApp to generate a safety message.'}
                </div>
              </div>
              <div className="flex flex-col gap-3 md:flex-row">
                <button
                  type="button"
                  className={`rounded-3xl px-6 py-4 text-sm font-semibold transition ${whatsappConnected ? 'bg-prism-sage text-prism-dark' : 'border border-prism-navy bg-transparent text-prism-light hover:border-prism-sage'}`}
                  onClick={() => setWhatsappConnected(!whatsappConnected)}
                >
                  {whatsappConnected ? 'Connected' : 'Connect WhatsApp'}
                </button>
                <button
                  type="button"
                  className="rounded-3xl bg-prism-sage px-6 py-4 text-sm font-semibold text-prism-dark transition hover:bg-prism-sage/90"
                  onClick={handleNext}
                >
                  Finish setup
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 rounded-3xl border border-prism-navy bg-prism-dark p-4 text-sm text-gray-400 md:flex-row md:items-center md:justify-between">
          <button
            type="button"
            onClick={handleBack}
            disabled={step === 1}
            className="rounded-3xl border border-prism-navy px-5 py-3 text-sm text-prism-light transition hover:border-prism-sage disabled:opacity-50"
          >
            <ArrowLeft size={16} className="inline-block" /> Back
          </button>

          <button
            type="button"
            onClick={handleNext}
            className="rounded-3xl bg-prism-sage px-6 py-3 text-sm font-semibold text-prism-dark transition hover:bg-prism-sage/90"
          >
            {step === steps.length ? 'Go to dashboard' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
