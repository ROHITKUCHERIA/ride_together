import { describe, expect, it } from 'vitest'
import { hourIsDaytime } from './ThemeContext'

describe('hourIsDaytime', () => {
  it('is day from 06:00 and all morning/afternoon', () => {
    expect(hourIsDaytime(new Date(2026, 7, 15, 6, 0))).toBe(true)
    expect(hourIsDaytime(new Date(2026, 7, 15, 12, 0))).toBe(true)
  })

  it('is night before 06:00', () => {
    expect(hourIsDaytime(new Date(2026, 7, 15, 3, 0))).toBe(false)
  })

  it('is night from 18:00 onwards', () => {
    expect(hourIsDaytime(new Date(2026, 7, 15, 19, 0))).toBe(false)
  })

  it('flips exactly at the 18:00 boundary', () => {
    expect(hourIsDaytime(new Date(2026, 7, 15, 17, 59))).toBe(true)
    expect(hourIsDaytime(new Date(2026, 7, 15, 18, 0))).toBe(false)
  })
})