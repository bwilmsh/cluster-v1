'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

interface ThemeContextType {
  theme: Theme
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark')

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as Theme | null
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true
    const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light')
    setThemeState(initialTheme)
  }, [])

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const applyTheme = (newTheme: Theme) => {
    const htmlElement = document.documentElement

    htmlElement.dataset.theme = newTheme
    htmlElement.classList.toggle('light-mode', newTheme === 'light')
    htmlElement.classList.toggle('dark-mode', newTheme === 'dark')
    
    localStorage.setItem('theme', newTheme)
  }

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setThemeState(newTheme)
    applyTheme(newTheme)
  }

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme)
    applyTheme(newTheme)
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
