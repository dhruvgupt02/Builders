import { useEffect } from 'react'

/** Full-screen image zoom. Closes on click, the close button or Escape. */
export default function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  return (
    <div role="dialog" aria-modal="true" aria-label={alt} onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-ink/95 p-3 sm:p-8 cursor-zoom-out">
      <img src={src} alt={alt} className="max-h-full max-w-full rounded-xl object-contain" />
      <button autoFocus onClick={onClose} className="absolute right-3 top-3 sm:right-6 sm:top-6 h-11 px-4 rounded-btn bg-cream text-ink display tracking-normal text-xs hover:bg-white">
        Close
      </button>
    </div>
  )
}
