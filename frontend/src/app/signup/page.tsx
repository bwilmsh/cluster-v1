'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function SignupPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    firstName: '',
    email: '',
    password: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.firstName.trim()) {
      newErrors.firstName = 'First name is required'
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email'
    }

    if (!formData.password) {
      newErrors.password = 'Password is required'
    } else if (formData.password.length < 8) {
      newErrors.password = 'Must be at least 8 characters'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: '',
      }))
    }
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setIsLoading(true)
    try {
      // TODO: Connect to actual API endpoint
      // const response = await fetch('/api/auth/signup', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(formData),
      // })
      // const data = await response.json()

      // For now, just navigate to chat
      setTimeout(() => {
        router.push('/dashboard')
      }, 500)
    } catch (error) {
      setErrors({ form: 'Failed to create account. Please try again.' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleSignUp = () => {
    // TODO: Connect to Google OAuth
    console.log('Google sign-up clicked')
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* Left Column - Form */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '48px 40px',
          background: 'white',
          overflowY: 'auto',
        }}
      >
        <div style={{ maxWidth: 360, width: '100%' }}>
          {/* Logo / Brand */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 48,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                background: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
                fontWeight: 'bold',
                color: 'var(--bg-primary)',
              }}
            >
              ⚙️
            </div>
            <span style={{ fontSize: 20, fontWeight: 'bold', color: 'var(--text-primary)' }}>Untitled UI</span>
          </div>

          {/* Heading */}
          <h1 style={{ fontSize: 32, fontWeight: 'bold', marginBottom: 8, color: '#1a1a1a' }}>
            Create account
          </h1>

          {/* Subheading */}
          <p style={{ color: '#666', marginBottom: 32, fontSize: 14 }}>
            Start your free 14-day trial. No credit card required.
          </p>

          {/* Google Sign-Up Button */}
          <button
            onClick={handleGoogleSignUp}
            style={{
              width: '100%',
              padding: '12px 16px',
                border: '1px solid var(--border)',
              borderRadius: 8,
                background: 'var(--bg-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              fontSize: 14,
              fontWeight: 500,
                color: 'var(--text-primary)',
              marginBottom: 24,
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f8f8f8'
              e.currentTarget.style.borderColor = '#d0d0d0'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'white'
              e.currentTarget.style.borderColor = '#e0e0e0'
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="1" />
            </svg>
            Sign up with Google
          </button>

          {/* Divider */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 24,
            }}
          >
            <div style={{ flex: 1, height: 1, background: '#e0e0e0' }} />
            <span style={{ color: '#999', fontSize: 12 }}>Or</span>
            <div style={{ flex: 1, height: 1, background: '#e0e0e0' }} />
          </div>

          {/* Form Error */}
          {errors.form && (
            <div
              style={{
                padding: 12,
                background: '#fee2e2',
                border: '1px solid #fecaca',
                borderRadius: 8,
                color: '#dc2626',
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              {errors.form}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSignUp}>
            {/* First Name */}
            <div style={{ marginBottom: 20 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#1a1a1a',
                  marginBottom: 6,
                }}
              >
                First name<span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                placeholder="Enter your first name"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: `1px solid ${errors.firstName ? '#fecaca' : '#e0e0e0'}`,
                  borderRadius: 8,
                  fontSize: 14,
                  outline: 'none',
                  transition: 'all 0.2s',
                  fontFamily: 'inherit',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = errors.firstName ? '#fecaca' : '#4fb8a8'
                  e.target.style.boxShadow = errors.firstName
                    ? '0 0 0 3px rgba(254, 202, 202, 0.5)'
                    : '0 0 0 3px rgba(79, 184, 168, 0.1)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = errors.firstName ? '#fecaca' : '#e0e0e0'
                  e.target.style.boxShadow = 'none'
                }}
              />
              {errors.firstName && (
                <p style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>
                  {errors.firstName}
                </p>
              )}
            </div>

            {/* Email */}
            <div style={{ marginBottom: 20 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#1a1a1a',
                  marginBottom: 6,
                }}
              >
                Email<span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="Enter your email"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: `1px solid ${errors.email ? '#fecaca' : '#e0e0e0'}`,
                  borderRadius: 8,
                  fontSize: 14,
                  outline: 'none',
                  transition: 'all 0.2s',
                  fontFamily: 'inherit',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = errors.email ? '#fecaca' : '#4fb8a8'
                  e.target.style.boxShadow = errors.email
                    ? '0 0 0 3px rgba(254, 202, 202, 0.5)'
                    : '0 0 0 3px rgba(79, 184, 168, 0.1)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = errors.email ? '#fecaca' : '#e0e0e0'
                  e.target.style.boxShadow = 'none'
                }}
              />
              {errors.email && (
                <p style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>
                  {errors.email}
                </p>
              )}
            </div>

            {/* Password */}
            <div style={{ marginBottom: 24 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#1a1a1a',
                  marginBottom: 6,
                }}
              >
                Password<span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Create a password"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: `1px solid ${errors.password ? '#fecaca' : '#e0e0e0'}`,
                  borderRadius: 8,
                  fontSize: 14,
                  outline: 'none',
                  transition: 'all 0.2s',
                  fontFamily: 'inherit',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = errors.password ? '#fecaca' : '#4fb8a8'
                  e.target.style.boxShadow = errors.password
                    ? '0 0 0 3px rgba(254, 202, 202, 0.5)'
                    : '0 0 0 3px rgba(79, 184, 168, 0.1)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = errors.password ? '#fecaca' : '#e0e0e0'
                  e.target.style.boxShadow = 'none'
                }}
              />
              {errors.password && (
                <p style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>
                  {errors.password}
                </p>
              )}
              {!errors.password && formData.password && (
                <p style={{ color: '#666', fontSize: 12, marginTop: 4 }}>
                  Must be at least 8 characters.
                </p>
              )}
            </div>

            {/* Create Account Button */}
            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: 'var(--accent)',
                color: 'var(--bg-primary)',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.7 : 1,
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                if (!isLoading) {
                  e.currentTarget.style.background = 'var(--accent-hover)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isLoading) {
                  e.currentTarget.style.background = 'var(--accent)'
                }
              }}
            >
              {isLoading ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          {/* Sign In Link */}
          <p style={{ textAlign: 'center', marginTop: 16, fontSize: 14, color: '#666' }}>
            Already have an account?{' '}
            <Link
              href="/signin"
              style={{
                color: 'var(--accent)',
                textDecoration: 'none',
                fontWeight: 600,
              }}
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>

      {/* Right Column - Hero Image */}
      <div
        style={{
          flex: 1,
          backgroundColor: '#000000',
          backgroundImage: `url('https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=800&h=1200&fit=crop')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          alignItems: 'flex-start',
          padding: '48px 40px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Dark overlay */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.35)',
            zIndex: 1,
          }}
        />

        {/* Content */}
        <div style={{ position: 'relative', zIndex: 2, maxWidth: 480 }}>
          {/* Sparkle icon */}
          <div style={{ fontSize: 32, marginBottom: 24 }}>✨</div>

          {/* Heading */}
          <h2
            style={{
              fontSize: 48,
              fontWeight: 'bold',
              color: 'white',
              lineHeight: 1.2,
              marginBottom: 16,
            }}
          >
            Start turning your ideas into reality.
          </h2>

          {/* Description */}
          <p
            style={{
              fontSize: 16,
              color: 'rgba(255, 255, 255, 0.9)',
              marginBottom: 32,
              lineHeight: 1.6,
            }}
          >
            Create a free account and get full access to all features for 30 days. No credit card needed. Trusted by over 4,000 professionals.
          </p>

          {/* Testimonials */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Avatars */}
            <div style={{ display: 'flex', marginRight: 8 }}>
              {[
                'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop',
                'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop',
                'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop',
                'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop',
              ].map((avatar, idx) => (
                <img
                  key={idx}
                  src={avatar}
                  alt="Avatar"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    border: '2px solid rgba(255, 255, 255, 0.5)',
                    marginLeft: idx > 0 ? -8 : 0,
                  }}
                />
              ))}
            </div>

            {/* Rating */}
            <div>
              <div style={{ display: 'flex', gap: 2, marginBottom: 2 }}>
                {[...Array(5)].map((_, i) => (
                  <span key={i} style={{ color: '#fbbf24', fontSize: 16 }}>
                    ★
                  </span>
                ))}
              </div>
              <p style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: 12 }}>
                <strong>5.0</strong> from 200+ reviews
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile stacking - hide right column on small screens */}
      <style>{`
        @media (max-width: 1024px) {
          div[style*="flex: 1"] {
            display: none;
          }
        }
      `}</style>
    </div>
  )
}
