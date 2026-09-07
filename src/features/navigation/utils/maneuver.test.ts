import { describe, expect, it } from 'vitest'
import { isUpcomingManeuver, maneuverRoadLine, maneuverTitle, maneuverVoicePhrase, ordinal } from './maneuver'
import type { NavigationInstruction } from '../types'

function instruction(partial: Partial<NavigationInstruction> = {}): NavigationInstruction {
  return {
    id: 'step-1',
    type: 'turn',
    modifier: 'right',
    text: 'Turn right onto NH 44',
    distanceMeters: 250,
    durationSeconds: 30,
    latitude: 17.385,
    longitude: 78.486,
    ...partial,
  }
}

describe('maneuver utils', () => {
  it('titles every turn modifier', () => {
    expect(maneuverTitle('turn', 'left')).toBe('Turn Left')
    expect(maneuverTitle('turn', 'right')).toBe('Turn Right')
    expect(maneuverTitle('turn', 'slight-left')).toBe('Turn Slight Left')
    expect(maneuverTitle('turn', 'slight-right')).toBe('Turn Slight Right')
    expect(maneuverTitle('turn', 'sharp-left')).toBe('Turn Sharp Left')
    expect(maneuverTitle('turn', 'sharp-right')).toBe('Turn Sharp Right')
    expect(maneuverTitle('turn')).toBe('Turn')
  })

  it('titles non-turn maneuvers', () => {
    expect(maneuverTitle('continue', 'straight')).toBe('Continue Straight')
    expect(maneuverTitle('continue')).toBe('Continue Straight')
    expect(maneuverTitle('merge', 'right')).toBe('Merge Right')
    expect(maneuverTitle('fork', 'left')).toBe('Keep Left')
    expect(maneuverTitle('uturn')).toBe('U-turn')
    expect(maneuverTitle('arrive')).toBe('Arrive')
    expect(maneuverTitle('unknown')).toBe('Navigation')
  })

  it('formats roundabout exits only when provided', () => {
    expect(maneuverTitle('roundabout', undefined, 2)).toBe('Take the 2nd exit')
    expect(maneuverTitle('roundabout', undefined, 1)).toBe('Take the 1st exit')
    expect(maneuverTitle('roundabout', undefined, 3)).toBe('Take the 3rd exit')
    expect(maneuverTitle('roundabout')).toBe('Roundabout')
  })

  it('builds ordinal suffixes', () => {
    expect(ordinal(1)).toBe('1st')
    expect(ordinal(2)).toBe('2nd')
    expect(ordinal(3)).toBe('3rd')
    expect(ordinal(4)).toBe('4th')
    expect(ordinal(21)).toBe('21st')
  })

  it('reads the road line from a maneuver', () => {
    expect(maneuverRoadLine(instruction({ roadName: 'NH 44' }))).toBe('NH 44')
    expect(maneuverRoadLine(instruction())).toBe('')
    expect(maneuverRoadLine(null)).toBe('')
  })

  it('builds far voice phrases with human-friendly distances', () => {
    expect(maneuverVoicePhrase(instruction({ roadName: 'NH 44' }), 'far', 247)).toBe('Turn Right in 250 meters onto NH 44')
    expect(maneuverVoicePhrase(instruction(), 'far', 12_230)).toBe('Turn Right in 12 kilometers.')
    expect(maneuverVoicePhrase(instruction(), 'far')).toBe('Turn Right.')
  })

  it('builds near voice phrases without the countdown', () => {
    expect(maneuverVoicePhrase(instruction({ roadName: 'NH 44' }), 'near')).toBe('Turn Right onto NH 44.')
    expect(maneuverVoicePhrase(instruction({ type: 'arrive', text: 'Arrive' }), 'near')).toBe('You have arrived at your destination.')
  })

  it('keeps the roundabout exit wording in voice phrases', () => {
    const r = instruction({ type: 'roundabout', exitNumber: 2, roadName: 'Necklace Rd' })
    expect(maneuverVoicePhrase(r, 'near')).toBe('Take the 2nd exit onto Necklace Rd.')
  })

  it('classifies upcoming maneuvers', () => {
    expect(isUpcomingManeuver(instruction({ type: 'turn' }))).toBe(true)
    expect(isUpcomingManeuver(instruction({ type: 'arrive' }))).toBe(false)
    expect(isUpcomingManeuver(null)).toBe(false)
    expect(isUpcomingManeuver(undefined)).toBe(false)
  })
})