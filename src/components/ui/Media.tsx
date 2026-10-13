import { useEffect, useState, type ImgHTMLAttributes } from 'react'

/**
 * Image that degrades to a branded placeholder if the file is missing or fails to load,
 * so a slow or blocked image host never leaves an empty box.
 */
export default function Media({ src, alt, className = '', ...rest }: ImgHTMLAttributes<HTMLImageElement>) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])

  if (!src || failed)
    return (
      <div role="img" aria-label={alt} className={`${className} bg-ink flex flex-col items-center justify-center gap-3 p-4 text-center`}>
        <div className="dots h-9 w-9" aria-hidden />
        <span className="display text-[10px] text-cream/70 line-clamp-2">{alt}</span>
      </div>
    )
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} {...rest} />
}
