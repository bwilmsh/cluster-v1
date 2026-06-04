'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function HomePage() {
  const router = useRouter()
  const [streamingText, setStreamingText] = useState('')
  const fullText = "I'll find optimal times for all 3 meetings, block your focus time, and send invites. One moment..."

  useEffect(() => {
    // Start streaming animation
    let index = 0
    const interval = setInterval(() => {
      if (index < fullText.length) {
        setStreamingText(fullText.substring(0, index + 1))
        index++
      } else {
        clearInterval(interval)
        // Reset after 3 seconds
        setTimeout(() => {
          index = 0
          setStreamingText('')
          // Restart loop
          const restartInterval = setInterval(() => {
            if (index < fullText.length) {
              setStreamingText(fullText.substring(0, index + 1))
              index++
            } else {
              clearInterval(restartInterval)
            }
          }, 30)
        }, 3000)
      }
    }, 30)

    return () => clearInterval(interval)
  }, [])

  const handleSignUp = () => {
    router.push('/signup')
  }

  const handleGetStarted = () => {
    router.push('/signup')
  }

  const handleChat = () => {
    router.push('/dashboard')
  }

  return (
    <div style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', minHeight: '100vh', overflow: 'hidden' }}>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'var(--bg-primary)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Navigation */}
        <nav
          style={{
            borderBottom: '1px solid var(--border)',
            padding: '24px',
            position: 'sticky',
            top: 0,
            background: 'var(--bg-primary)',
            backdropFilter: 'blur(12px)',
            backgroundClip: 'padding-box',
            zIndex: 50,
          }}
        >
          <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 8,
                    background: 'var(--accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                  fontWeight: 'bold',
                    color: 'var(--bg-primary)',
                }}
              >
                ⚙️
              </div>
              <span style={{ fontSize: 20, fontWeight: 'bold' }}>Cluster</span>
            </div>
            <button
              onClick={handleSignUp}
              style={{
                background: 'var(--accent)',
                color: 'var(--bg-primary)',
                fontWeight: 600,
                padding: '10px 24px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                fontSize: 14,
                boxShadow: '0 4px 16px rgba(13, 148, 136, 0.22)',
                transition: 'all 0.3s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--accent-hover)'
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(13, 148, 136, 0.26)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--accent)'
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(13, 148, 136, 0.22)'
              }}
            >
              Sign In
            </button>
          </div>
        </nav>

        {/* Hero Section */}
        <section style={{ padding: '96px 24px' }}>
          <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
            <h1
              style={{
                fontSize: 60,
                fontWeight: 'bold',
                lineHeight: 1.2,
                marginBottom: 24,
              }}
            >
              Life runs smoother
              <br />
              <span style={{ color: 'var(--accent)' }}>with Cluster</span>
            </h1>
            <p style={{ fontSize: 18, color: 'var(--text-secondary)', marginBottom: 32 }}>
              AI-powered scheduling, intelligent agents, and laser-focused task management. All in one place.
            </p>
            <button
              onClick={handleGetStarted}
              style={{
                background: 'var(--accent)',
                color: 'var(--bg-primary)',
                fontWeight: 600,
                padding: '14px 32px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                fontSize: 16,
                boxShadow: '0 4px 16px rgba(79, 184, 168, 0.3)',
                transition: 'all 0.3s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--accent-hover)'
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(79, 184, 168, 0.4)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--accent)'
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(79, 184, 168, 0.3)'
              }}
            >
              Get Started Free
            </button>
          </div>
        </section>

        {/* Streaming Text Animation Demo */}
        <section
          style={{
            padding: '64px 24px',
            borderTop: '1px solid var(--border)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Experience Streaming Intelligence
            </p>
            <div
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 24,
              }}
            >
              <div style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
                <span style={{ color: 'var(--text-tertiary)' }}>You: </span>Schedule my meetings for next week
              </div>
              <div style={{ color: 'var(--accent)', fontWeight: 500 }}>
                <span style={{ color: 'var(--text-tertiary)' }}>Cluster: </span>
                <span style={{ borderRight: '2px solid var(--accent)', paddingRight: 4 }}>
                  {streamingText}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Conversational UI Preview */}
        <section style={{ padding: '96px 24px' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <h2 style={{ fontSize: 32, fontWeight: 'bold', marginBottom: 48, textAlign: 'center' }}>
              Conversational Interface
            </h2>
            <div
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 24,
                maxHeight: 300,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div
                  style={{
                    background: 'var(--accent)',
                    color: 'var(--bg-primary)',
                    borderRadius: 16,
                    padding: '8px 16px',
                    maxWidth: '60%',
                    fontSize: 14,
                  }}
                >
                  What meetings do I have tomorrow?
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div
                  style={{
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    borderRadius: 16,
                    padding: '8px 16px',
                    maxWidth: '60%',
                    fontSize: 14,
                    border: '1px solid var(--border)',
                  }}
                >
                  You have 3 meetings tomorrow. Would you like me to reschedule any of them?
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div
                  style={{
                    background: 'var(--accent)',
                    color: 'var(--bg-primary)',
                    borderRadius: 16,
                    padding: '8px 16px',
                    maxWidth: '60%',
                    fontSize: 14,
                  }}
                >
                  Move the 2pm with Sarah to Thursday
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div
                  style={{
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    borderRadius: 16,
                    padding: '8px 16px',
                    maxWidth: '60%',
                    fontSize: 14,
                    border: '1px solid var(--border)',
                  }}
                >
                  ✓ Rescheduled to Thursday at 2pm. Sarah has been notified.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section
          style={{
            padding: '96px 24px',
            borderTop: '1px solid var(--border)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <h2 style={{ fontSize: 32, fontWeight: 'bold', marginBottom: 64, textAlign: 'center' }}>
              Cluster Capabilities
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: 32,
              }}
            >
              {[
                { emoji: '📅', title: 'AI Scheduling', desc: 'Let AI handle calendar conflicts, find optimal meeting times, and intelligently block focus time. Your schedule, perfected.' },
                { emoji: '🤖', title: 'AI Agents', desc: 'Deploy autonomous agents that manage tasks, respond to emails, and coordinate with your team 24/7 without interruption.' },
                { emoji: '🎯', title: 'Task Focus', desc: 'Prioritize what matters. AI helps you identify high-impact tasks and eliminates context switching so you stay in flow.' },
              ].map((feature, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: 32,
                    transition: 'all 0.3s cubic-bezier(0.23, 1, 0.320, 1)',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)'
                    e.currentTarget.style.borderColor = 'var(--accent)'
                    e.currentTarget.style.background = 'var(--bg-tertiary)'
                    e.currentTarget.style.boxShadow = '0 20px 40px rgba(79, 184, 168, 0.1)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.borderColor = 'var(--border)'
                    e.currentTarget.style.background = 'var(--bg-secondary)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  <div style={{ fontSize: 40, marginBottom: 16 }}>{feature.emoji}</div>
                  <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>{feature.title}</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
                    {feature.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Integrations */}
        <section style={{ padding: '96px 24px' }}>
          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            <h2 style={{ fontSize: 32, fontWeight: 'bold', marginBottom: 48, textAlign: 'center' }}>
              Works With Your Tools
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))',
                gap: 16,
              }}
            >
              {['Google', 'Cal.com', 'Slack', 'Teams', 'Notion', 'Linear', 'GitHub', 'Zapier'].map((tool, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 64,
                    height: 64,
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    margin: '0 auto',
                  }}
                >
                  {tool}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section
          style={{
            padding: '96px 24px',
            borderTop: '1px solid var(--border)',
          }}
        >
          <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
            <h2 style={{ fontSize: 36, fontWeight: 'bold', marginBottom: 24 }}>
              Ready to run smoother?
            </h2>
            <p
              style={{
                fontSize: 18,
                color: 'var(--text-secondary)',
                marginBottom: 32,
              }}
            >
              Join teams that use Cluster to reclaim hours every week.
            </p>
            <button
              onClick={handleGetStarted}
              style={{
                background: 'var(--accent)',
                color: 'var(--bg-primary)',
                fontWeight: 600,
                padding: '16px 40px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                fontSize: 16,
                boxShadow: '0 4px 16px rgba(79, 184, 168, 0.3)',
                transition: 'all 0.3s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--accent-hover)'
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(79, 184, 168, 0.4)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--accent)'
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(79, 184, 168, 0.3)'
              }}
            >
              Sign Up Free
            </button>
            <p style={{ color: 'var(--text-tertiary)', marginTop: 16, fontSize: 14 }}>
              No credit card required · 14-day free trial
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer
          style={{
            borderTop: '1px solid var(--border)',
            padding: '48px 24px',
          }}
        >
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: 32,
                marginBottom: 48,
              }}
            >
              {[
                {
                  title: 'Product',
                  links: ['Features', 'Pricing', 'Security'],
                },
                {
                  title: 'Company',
                  links: ['About', 'Blog', 'Careers'],
                },
                {
                  title: 'Legal',
                  links: ['Privacy', 'Terms', 'Contact'],
                },
                {
                  title: 'Social',
                  links: ['Twitter', 'LinkedIn', 'GitHub'],
                },
              ].map((section, idx) => (
                <div key={idx}>
                  <p style={{ fontWeight: 600, marginBottom: 16 }}>{section.title}</p>
                  <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {section.links.map((link, linkIdx) => (
                      <li key={linkIdx}>
                        <a
                          href="#"
                          style={{
                            color: 'var(--text-secondary)',
                            textDecoration: 'none',
                            fontSize: 14,
                            transition: 'color 0.3s',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
                          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
                        >
                          {link}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div
              style={{
                borderTop: '1px solid var(--border)',
                paddingTop: 32,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 16,
              }}
            >
              <p style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>
                © 2026 Cluster. All rights reserved.
              </p>
              <p style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>
                Built for humans, powered by AI
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}