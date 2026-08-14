'use client'
import React, { useState, useEffect } from 'react'
import { Play, Maximize, Minimize } from 'lucide-react'


export function PresentationModeToggle() {
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [isPresenting, setIsPresenting] = useState(false)

    useEffect(() => {
        if (isPresenting) {
            document.documentElement.classList.add('presentation-mode')
        } else {
            document.documentElement.classList.remove('presentation-mode')
        }
    }, [isPresenting])

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen()
            setIsFullscreen(true)
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen()
                setIsFullscreen(false)
            }
        }
    }

    return (
        <div className="flex items-center gap-2">
            <button 
                onClick={() => setIsPresenting(!isPresenting)}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${isPresenting ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-700 dark:bg-[#2C2C2E] dark:text-gray-300'}`}
                title="Toggle Presentation Mode"
            >
                <Play size={14} />
                {isPresenting ? 'Presenting' : 'Present'}
            </button>
            <button 
                onClick={toggleFullscreen}
                className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-[#2C2C2E] rounded-md transition-colors"
                title="Toggle Fullscreen"
            >
                {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>
        </div>
    )
}

export function ScenarioSwitcher() {
    const [active, setActive] = useState('1')
    const [scenarios, setScenarios] = useState<Record<string, string>>({})
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchScenarios = async () => {
            try {
                const res = await fetch('/demo/scenarios')
                if (res.ok) {
                    const data = await res.json()
                    setActive(data.active)
                    setScenarios(data.scenarios)
                }
            } catch (err) {
                console.error(err)
            } finally {
                setLoading(false)
            }
        }
        fetchScenarios()
    }, [])

    const switchScenario = async (id: string) => {
        try {
            const res = await fetch(`/demo/scenario/${id}`, { method: 'POST' })
            if (res.ok) {
                const data = await res.json()
                setActive(id)
                // Force reload or trigger event to refresh data
                window.dispatchEvent(new Event('scenario-changed'))
            }
        } catch (err) {
            console.error(err)
        }
    }

    if (loading || Object.keys(scenarios).length === 0) return null

    return (
        <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500 font-medium">Scenario:</span>
            <select 
                value={active} 
                onChange={(e) => switchScenario(e.target.value)}
                className="bg-white dark:bg-[#1C1C1E] border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 outline-none text-gray-700 dark:text-gray-300"
            >
                {Object.entries(scenarios).map(([id, name]) => (
                    <option key={id} value={id}>{name}</option>
                ))}
            </select>
        </div>
    )
}
