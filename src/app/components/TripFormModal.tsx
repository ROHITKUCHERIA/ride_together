import { lazy, Suspense, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { LocateFixed, MapPin } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import TextField from '../../components/ui/TextField'
import Button from '../../components/ui/Button'
import { isApiError } from '../../lib/errors'
import type { CreateTripInput, Trip } from '../../types/api'

const MapCoordPicker = lazy(() => import('./MapCoordPicker'))

interface TripFormModalProps {
  open: boolean
  onClose: () => void
  mode: 'create' | 'edit'
  initial?: Trip
  onSubmit: (input: CreateTripInput) => Promise<void>
}

interface FormState {
  name: string
  description: string
  startLocation: string
  destination: string
  startLatitude: string
  startLongitude: string
  destinationLatitude: string
  destinationLongitude: string
  startDate: string
  endDate: string
}

type FieldName = keyof FormState

interface FieldErrors {
  name?: string
  destination?: string
  startDate?: string
  endDate?: string
  startLatitude?: string
  startLongitude?: string
  destinationLatitude?: string
  destinationLongitude?: string
  dates?: string
}

const empty: FormState = {
  name: '',
  description: '',
  startLocation: '',
  destination: '',
  startLatitude: '',
  startLongitude: '',
  destinationLatitude: '',
  destinationLongitude: '',
  startDate: '',
  endDate: '',
}

function toDateInput(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  return d.toISOString().slice(0, 10)
}

function numOrUndefined(value: string): number | undefined {
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : Number.NaN
}

function parseCoord(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

type PickerKind = 'start' | 'destination' | null

export default function TripFormModal({ open, onClose, mode, initial, onSubmit }: TripFormModalProps) {
  const [form, setForm] = useState<FormState>(empty)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [picker, setPicker] = useState<PickerKind>(null)
  const [locating, setLocating] = useState(false)

  useEffect(() => {
    if (!open) return
    setFormError(null)
    setFieldErrors({})
    setSubmitting(false)
    setPicker(null)
    if (mode === 'edit' && initial) {
      setForm({
        name: initial.name,
        description: initial.description ?? '',
        startLocation: initial.startLocation ?? '',
        destination: initial.destination,
        startLatitude: initial.startLatitude?.toString() ?? '',
        startLongitude: initial.startLongitude?.toString() ?? '',
        destinationLatitude: initial.destinationLatitude?.toString() ?? '',
        destinationLongitude: initial.destinationLongitude?.toString() ?? '',
        startDate: toDateInput(initial.startDate),
        endDate: toDateInput(initial.endDate),
      })
    } else {
      setForm(empty)
    }
  }, [open, mode, initial])

  // Default the start coordinates to the rider's current location when creating.
  useEffect(() => {
    if (!open || mode !== 'create') return
    if (!('geolocation' in navigator)) return
    let cancelled = false
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return
        setForm((prev) =>
          prev.startLatitude.trim() === ''
            ? {
                ...prev,
                startLatitude: pos.coords.latitude.toFixed(6),
                startLongitude: pos.coords.longitude.toFixed(6),
              }
            : prev,
        )
      },
      () => {},
      { timeout: 8000, maximumAge: 120000 },
    )
    return () => {
      cancelled = true
    }
  }, [open, mode])

  const set = (name: FieldName) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [name]: e.target.value }))
    setFieldErrors((prev) => (prev[name as keyof FieldErrors] ? { ...prev, [name]: undefined } : prev))
  }

  const useMyLocation = () => {
    setFormError(null)
    if (!('geolocation' in navigator)) {
      setFieldErrors((prev) => ({ ...prev, startLatitude: 'Geolocation is not supported on this device.' }))
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((prev) => ({
          ...prev,
          startLatitude: pos.coords.latitude.toFixed(6),
          startLongitude: pos.coords.longitude.toFixed(6),
        }))
        setLocating(false)
      },
      (err) => {
        const message = err.code === 1 ? 'Location permission was denied.' : 'Could not get your location.'
        setFieldErrors((prev) => ({ ...prev, startLatitude: message }))
        setLocating(false)
      },
      { timeout: 12000, maximumAge: 0, enableHighAccuracy: false },
    )
  }

  const pickerInitial = (): [number, number] | null => {
    if (picker === 'start') {
      const lat = parseCoord(form.startLatitude)
      const lng = parseCoord(form.startLongitude)
      return lat != null && lng != null ? [lat, lng] : null
    }
    const lat = parseCoord(form.destinationLatitude)
    const lng = parseCoord(form.destinationLongitude)
    return lat != null && lng != null ? [lat, lng] : null
  }

  const applyPickedCoords = (lat: number, lng: number) => {
    if (picker === 'start') {
      setForm((prev) => ({
        ...prev,
        startLatitude: lat.toFixed(6),
        startLongitude: lng.toFixed(6),
      }))
    } else {
      setForm((prev) => ({
        ...prev,
        destinationLatitude: lat.toFixed(6),
        destinationLongitude: lng.toFixed(6),
      }))
    }
    setFieldErrors((prev) => ({ ...prev, startLatitude: undefined, startLongitude: undefined, destinationLatitude: undefined, destinationLongitude: undefined }))
    setPicker(null)
  }

  const validate = (): boolean => {
    const errors: FieldErrors = {}
    if (!form.name.trim()) errors.name = 'Trip name is required.'
    else if (form.name.trim().length < 2) errors.name = 'At least 2 characters.'
    if (!form.destination.trim()) errors.destination = 'Destination is required.'
    else if (form.destination.trim().length < 2) errors.destination = 'At least 2 characters.'
    if (!form.startDate) errors.startDate = 'Start date is required.'
    if (!form.endDate) errors.endDate = 'End date is required.'
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      errors.dates = 'End date cannot be earlier than the start date.'
    }

    const startLat = numOrUndefined(form.startLatitude)
    const startLng = numOrUndefined(form.startLongitude)
    const destLat = numOrUndefined(form.destinationLatitude)
    const destLng = numOrUndefined(form.destinationLongitude)

    const coords = (
      lat: number | undefined,
      lng: number | undefined,
      latKey: 'startLatitude' | 'destinationLatitude',
      lngKey: 'startLongitude' | 'destinationLongitude',
    ) => {
      if (Number.isNaN(lat)) errors[latKey] = 'Latitude must be a number.'
      if (Number.isNaN(lng)) errors[lngKey] = 'Longitude must be a number.'
      if (lat !== undefined && !Number.isNaN(lat) && (lat < -90 || lat > 90)) errors[latKey] = 'Latitude must be between -90 and 90.'
      if (lng !== undefined && !Number.isNaN(lng) && (lng < -180 || lng > 180)) errors[lngKey] = 'Longitude must be between -180 and 180.'
      const oneSet = (lat !== undefined) !== (lng !== undefined)
      if (oneSet) errors[latKey] = 'Latitude and longitude must be provided together.'
    }
    coords(startLat, startLng, 'startLatitude', 'startLongitude')
    coords(destLat, destLng, 'destinationLatitude', 'destinationLongitude')

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (!validate()) return

    const input: CreateTripInput = {
      name: form.name.trim(),
      description: form.description.trim() === '' ? undefined : form.description.trim(),
      startLocation: form.startLocation.trim() === '' ? undefined : form.startLocation.trim(),
      destination: form.destination.trim(),
      startLatitude: numOrUndefined(form.startLatitude),
      startLongitude: numOrUndefined(form.startLongitude),
      destinationLatitude: numOrUndefined(form.destinationLatitude),
      destinationLongitude: numOrUndefined(form.destinationLongitude),
      startDate: form.startDate,
      endDate: form.endDate,
    }

    setSubmitting(true)
    try {
      await onSubmit(input)
    } catch (err) {
      setFormError(isApiError(err) ? err.message : 'Unable to save the trip. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={mode === 'create' ? 'Start a new trip' : 'Edit trip'} eyebrow="Trip details">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {formError ? (
          <p role="alert" className="rounded-xl border border-road/35 bg-road/10 px-3.5 py-2.5 text-sm text-road">
            {formError}
          </p>
        ) : null}

        <TextField label="Trip name" placeholder="e.g. Goa Road Trip" value={form.name} onChange={set('name')} error={fieldErrors.name} />

        <TextField
          label="Description"
          placeholder="A quick note for the crew (optional)"
          value={form.description}
          onChange={set('description')}
        />

        <div className="grid grid-cols-2 gap-3">
          <TextField label="Start location" placeholder="City" value={form.startLocation} onChange={set('startLocation')} />
          <TextField label="Destination" placeholder="Where to?" value={form.destination} onChange={set('destination')} error={fieldErrors.destination} />
        </div>

        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-mist/70">Start coordinates (optional)</p>
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Latitude" inputMode="decimal" placeholder="17.3850" value={form.startLatitude} onChange={set('startLatitude')} error={fieldErrors.startLatitude} />
            <TextField label="Longitude" inputMode="decimal" placeholder="78.4867" value={form.startLongitude} onChange={set('startLongitude')} error={fieldErrors.startLongitude} />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" loading={locating} disabled={locating || picker !== null} onClick={useMyLocation}>
              <LocateFixed size={14} aria-hidden="true" />
              Use my location
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={picker !== null} onClick={() => setPicker('start')}>
              <MapPin size={14} aria-hidden="true" />
              Pick on map
            </Button>
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-mist/70">Destination coordinates (optional)</p>
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Latitude" inputMode="decimal" placeholder="15.4989" value={form.destinationLatitude} onChange={set('destinationLatitude')} error={fieldErrors.destinationLatitude} />
            <TextField label="Longitude" inputMode="decimal" placeholder="73.8278" value={form.destinationLongitude} onChange={set('destinationLongitude')} error={fieldErrors.destinationLongitude} />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={picker !== null} onClick={() => setPicker('destination')}>
              <MapPin size={14} aria-hidden="true" />
              Pick on map
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <TextField label="Start date" type="date" value={form.startDate} onChange={set('startDate')} error={fieldErrors.startDate} />
          <TextField label="End date" type="date" value={form.endDate} onChange={set('endDate')} error={fieldErrors.endDate} />
        </div>
        {fieldErrors.dates ? (
          <p className="text-xs text-road">{fieldErrors.dates}</p>
        ) : null}

        <div className="mt-2 flex gap-3">
          <Button type="button" variant="ghost" block onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" block loading={submitting}>
            {mode === 'create' ? 'Create trip' : 'Save changes'}
          </Button>
        </div>
      </form>

      {picker
        ? createPortal(
            <Suspense fallback={null}>
              <MapCoordPicker
                title={picker === 'start' ? 'Pick start location' : 'Pick destination'}
                initial={pickerInitial()}
                onClose={() => setPicker(null)}
                onConfirm={applyPickedCoords}
              />
            </Suspense>,
            document.body,
          )
        : null}
    </Modal>
  )
}