'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Paperclip, X, Loader2, ArrowUp } from 'lucide-react'
import type { Attachment, Format } from '@/lib/spec/types'
import { formatBytes } from '@/lib/client/api'

// FORMAT SELECTOR — replaces ModelSelector (Auto / Slides / Word / PDF)
const FORMAT_OPTIONS: { id: Format | 'auto'; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'pptx', label: 'Slides' },
  { id: 'docx', label: 'Word' },
  { id: 'pdf', label: 'PDF' },
]

function FormatSelector({
  value,
  onChange,
}: {
  value: Format | 'auto'
  onChange: (v: Format | 'auto') => void
}) {
  return (
    <div className="flex items-center rounded-full bg-white/[0.06] p-0.5 ring-1 ring-white/10 h-9 md:h-7" role="radiogroup" aria-label="Output format">
      {FORMAT_OPTIONS.map((f) => {
        const active = value === f.id
        return (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(f.id)}
            className={`inline-flex h-8 items-center justify-center rounded-full px-2.5 text-xs font-medium leading-none transition-colors md:h-6 md:px-2 md:text-[11px] ${
              active ? 'bg-white text-ink shadow-sm' : 'text-white/60 hover:bg-white/10 hover:text-white'
            }`}
          >
            {f.label}
          </button>
        )
      })}
    </div>
  )
}

// BOLT PROMPT BOX — adapted ChatInput for Folio
// Preserves Folio Props API (value/onChange/onSubmit/onFiles/attachments/busy etc)
// but renders with bolt dark aesthetic on sage canvas

const ACCEPT = '.pdf,.docx,.pptx,.txt,.md,.markdown,.csv,.tsv,.json,.html,.htm,.png,.jpg,.jpeg,.webp,.gif,.bmp'

type BoltPromptBoxProps = {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  onFiles?: (files: FileList | File[]) => void
  attachments?: Attachment[]
  onRemoveAttachment?: (id: string) => void
  busy?: boolean
  placeholder?: string
  size?: 'hero' | 'compact'
  preferredFormat?: Format | 'auto'
  onPreferredFormat?: (f: Format | 'auto') => void
  autoFocus?: boolean
}

export function BoltPromptBox({
  value,
  onChange,
  onSubmit,
  onFiles,
  attachments = [],
  onRemoveAttachment,
  busy,
  placeholder,
  size = 'compact',
  preferredFormat,
  onPreferredFormat,
  autoFocus,
}: BoltPromptBoxProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const hero = size === 'hero'
  const extracting = attachments.some((a) => a.status === 'extracting')
  const canSend = value.trim().length > 0 && !busy && !extracting

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    const base = hero ? 56 : 44
    const cap = hero ? 180 : 160
    ta.style.height = 'auto'
    const raw = ta.scrollHeight
    const isMultiline = raw > base + 8
    const target = isMultiline ? Math.min(raw * 1.15, cap) : Math.min(raw, cap)
    ta.style.height = `${Math.max(base, target)}px`
    ta.style.overflowY = (isMultiline ? raw * 1.15 : raw) > cap ? 'auto' : 'hidden'
  }, [value, hero])

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus()
  }, [autoFocus])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (canSend) onSubmit()
    }
  }

  return (
    <div className={`relative w-full ${hero ? 'mx-auto max-w-[680px]' : 'mx-auto max-w-none'}`}>
      <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-b from-white/[0.08] to-transparent pointer-events-none md:rounded-[19px]" />
      <div
        className={`relative flex flex-col overflow-visible rounded-2xl bg-[#232a26] ring-1 ring-white/[0.08] shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_16px_40px_rgba(15,20,16,0.18)] transition md:rounded-[19px] ${dragging ? 'ring-2 ring-white/20' : ''} ${hero ? 'p-3 md:p-3 max-h-[28dvh]' : 'p-2.5 md:p-2 max-h-[42dvh]'}`}
        onDragOver={(e) => {
          if (!onFiles) return
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (!onFiles) return
          e.preventDefault()
          setDragging(false)
          if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files)
        }}
      >
        {/* Attachments — capped, scrolls inside, doesn't push prompt (20% smaller) */}
        {attachments.length > 0 && (
          <div className="scroll-thin mb-2 flex max-h-[72px] flex-wrap gap-1 overflow-y-auto px-1 py-0.5">
            {attachments.map((a) => (
              <span
                key={a.id}
                className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[10px] md:px-1.5 md:py-0.5 md:text-[9px] ${
                  a.status === 'error' ? 'bg-red-500/15 text-red-300 ring-1 ring-red-500/20' : 'bg-white/10 text-white ring-1 ring-white/10'
                }`}
                title={a.error ?? `${a.chars.toLocaleString()} characters`}
              >
                {a.status === 'extracting' ? (
                  <Loader2 size={10} className="animate-spin text-white/60 md:h-2.5 md:w-2.5" />
                ) : (
                  <Paperclip size={10} className={a.status === 'error' ? 'text-red-300' : 'text-white/50 md:h-2.5 md:w-2.5'} />
                )}
                <span className="truncate">{a.name}</span>
                {a.status === 'ready' && <span className="hidden text-white/40 sm:inline md:text-[9px]">{formatBytes(a.size)}</span>}
                {a.status === 'error' && <span className="text-red-300/70">failed</span>}
                {onRemoveAttachment && (
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(a.id)}
                    className="-mr-1 rounded-full p-0.5 text-white/40 hover:bg-white/10 hover:text-white"
                    aria-label={`Remove ${a.name}`}
                  >
                    <X size={10} className="md:h-2.5 md:w-2.5" />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        <div className="relative flex min-h-0 flex-1 flex-col">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={hero ? 2 : 1}
            placeholder={placeholder ?? 'What do you want to build?'}
            disabled={busy}
            className={`block w-full resize-none border-0 bg-transparent text-white outline-none placeholder:text-white/30 scroll-thin overflow-y-auto ${hero ? 'px-2 py-1.5 text-[16px] leading-6 md:px-1.5 md:py-1 md:text-[14px]' : 'px-2 py-1.5 text-[15px] leading-6 md:text-[13px]'}`}
            style={{ minHeight: hero ? '56px' : '44px', maxHeight: hero ? '180px' : '160px' }}
          />
        </div>

        <div className="mt-1 flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-3 md:gap-3">
            {onFiles && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept={ACCEPT}
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) onFiles(e.target.files)
                    e.target.value = ''
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="group flex items-center gap-2 rounded-full bg-white/[0.08] px-2.5 py-1.5 pr-3 ring-1 ring-white/10 backdrop-blur-sm transition hover:bg-white/[0.12] hover:ring-white/15 md:gap-1.5 md:px-2 md:py-1 md:pr-2.5"
                  aria-label="Attach file"
                  title="Attach PDF, DOCX, PPTX, TXT, MD, CSV or image (PNG, JPG, WEBP)"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-ink shadow-sm transition group-hover:scale-105 md:h-5 md:w-5">
                    <Paperclip size={13} strokeWidth={1.9} className="md:h-3 md:w-3" />
                  </span>
                  <span className="hidden text-xs font-medium tracking-tight text-white/80 group-hover:text-white md:inline md:text-[11px]">attach file</span>
                </button>
              </>
            )}
            {onPreferredFormat && (
              <FormatSelector value={preferredFormat ?? 'auto'} onChange={onPreferredFormat} />
            )}
          </div>

          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSend}
            aria-label="Send"
            className={`flex items-center justify-center rounded-full bg-white text-ink shadow-[0_4px_12px_rgba(255,255,255,0.08)] transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-30 ${hero ? 'h-9 w-9 md:h-8 md:w-8' : 'h-8 w-8 md:h-7 md:w-7'}`}
          >
            {busy ? <Loader2 size={16} className="animate-spin md:h-3.5 md:w-3.5" /> : <ArrowUp size={16} strokeWidth={2.2} className="md:h-3.5 md:w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  )
}

// Full Bolt hero — preserved styled text from original (adapted to sage/ink)
// Keeps RayBackground, AnnouncementBadge, gradient title, subtitle, ImportButtons for demo
function RayBackgroundSage() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden select-none">
      <div className="absolute inset-0 bg-shell" />
      {/* soft sage radial behind title — bolt's blue ray adapted to ink/sage */}
      <div
        className="absolute left-1/2 top-[22%] h-[720px] w-[1200px] -translate-x-1/2 rounded-full opacity-[0.06]"
        style={{ background: 'radial-gradient(ellipse at center, #0f1410 0%, transparent 70%)' }}
      />
    </div>
  )
}

function AnnouncementBadge({ text }: { text: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-line/40 bg-white px-3 py-1 text-xs font-medium text-ink shadow-sm md:text-[11px]">
      <span className="flex h-1.5 w-1.5 rounded-full bg-[#4da5fc] animate-pulse" />
      {text}
    </div>
  )
}

export function BoltStyleChat({
  title = 'What will you',
  subtitle = 'Create stunning decks & documents by chatting with AI.',
  announcementText = 'Introducing Folio — AI decks from a prompt',
  placeholder = 'What do you want to build?',
  onSend,
}: {
  title?: string
  subtitle?: string
  announcementText?: string
  placeholder?: string
  onSend?: (m: string) => void
}) {
  const [v, setV] = useState('')
  return (
    <div className="relative flex min-h-[520px] w-full flex-col items-center justify-center overflow-hidden rounded-[28px] bg-shell px-4 py-10 md:rounded-[19px]">
      <RayBackgroundSage />
      <div className="relative flex w-full max-w-[700px] flex-col items-center">
        <AnnouncementBadge text={announcementText} />
        <div className="mt-4 text-center">
          <h1 className="text-center text-[34px] font-bold leading-[1.05] tracking-[-0.03em] text-ink md:text-[40px]">
            {title}{' '}
            <span className="bg-gradient-to-b from-[#4da5fc] via-[#4da5fc] to-ink bg-clip-text text-transparent italic">build</span> today?
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-center text-[15px] font-medium leading-relaxed text-muted md:text-[13px]">{subtitle}</p>
        </div>
        <div className="mt-6 w-full">
          <BoltPromptBox value={v} onChange={setV} onSubmit={() => onSend?.(v)} placeholder={placeholder} size="hero" />
        </div>
      </div>
    </div>
  )
}

// Default export for shadcn demo.tsx compatibility
export default BoltPromptBox
