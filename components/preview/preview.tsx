'use client'

import { BarLoader } from 'react-spinners'
import { CompassIcon, RefreshCwIcon } from 'lucide-react'
import { Panel, PanelHeader } from '@/components/panels/panels'
import { ScrollArea } from '@radix-ui/react-scroll-area'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

const DISPLAY_HOST = 'live.codemineapp.com'

/** Convert a real sandbox URL to our branded display URL */
function toDisplay(url: string): string {
  try {
    const u = new URL(url)
    return `https://${DISPLAY_HOST}${u.pathname}${u.search}${u.hash}`
  } catch {
    return url
  }
}

/** Convert a display URL back to the real sandbox URL using the current real URL as base */
function toReal(display: string, realBase: string): string {
  try {
    const base = new URL(realBase)
    const d = new URL(display)
    if (d.hostname === DISPLAY_HOST) {
      return `${base.origin}${d.pathname}${d.search}${d.hash}`
    }
    // User typed a full URL — use as-is (developer mode)
    return display
  } catch {
    return realBase
  }
}

interface Props {
  className?: string
  disabled?: boolean
  lastFilesUploadedAt?: number
  url?: string
}

export function Preview({ className, disabled, lastFilesUploadedAt, url }: Props) {
  const [currentUrl, setCurrentUrl] = useState(url)
  const [error, setError] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState(url ? toDisplay(url) : '')
  const [isLoading, setIsLoading] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    setCurrentUrl(url)
    setInputValue(url ? toDisplay(url) : '')
  }, [url])

  // Auto-refresh preview when AI uploads new files (3s delay for dev server to rebuild)
  useEffect(() => {
    if (!lastFilesUploadedAt || !currentUrl) return
    const timer = setTimeout(() => refreshIframe(), 3000)
    return () => clearTimeout(timer)
  }, [lastFilesUploadedAt, currentUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  const refreshIframe = () => {
    if (iframeRef.current && currentUrl) {
      setIsLoading(true)
      setError(null)
      iframeRef.current.src = ''
      setTimeout(() => {
        if (iframeRef.current) iframeRef.current.src = currentUrl
      }, 10)
    }
  }

  const loadNewUrl = () => {
    if (!iframeRef.current || !inputValue) return
    const realUrl = currentUrl ? toReal(inputValue, currentUrl) : inputValue
    if (realUrl !== currentUrl) {
      setIsLoading(true)
      setError(null)
      setCurrentUrl(realUrl)
      iframeRef.current.src = realUrl
    } else {
      refreshIframe()
    }
  }

  return (
    <Panel className={className}>
      <PanelHeader>
        <div className="absolute flex items-center space-x-1">
          <a href={currentUrl} target="_blank" className="cursor-pointer px-1">
            <CompassIcon className="w-4" />
          </a>
          <button
            onClick={refreshIframe}
            type="button"
            className={cn('cursor-pointer px-1', { 'animate-spin': isLoading })}
          >
            <RefreshCwIcon className="w-4" />
          </button>
        </div>

        <div className="m-auto h-6">
          {url && (
            <input
              type="text"
              className="font-mono text-xs h-6 border border-gray-200 px-4 bg-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[300px]"
              onChange={(e) => setInputValue(e.target.value)}
              onClick={(e) => e.currentTarget.select()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.currentTarget.blur(); loadNewUrl() }
              }}
              value={inputValue}
            />
          )}
        </div>
      </PanelHeader>

      <div className="flex h-[calc(100%-2rem-1px)] relative">
        {currentUrl && !disabled && (
          <>
            <ScrollArea className="w-full">
              <iframe
                ref={iframeRef}
                src={currentUrl}
                className="w-full h-full"
                onLoad={() => { setIsLoading(false); setError(null) }}
                onError={() => { setIsLoading(false); setError('Failed to load the page') }}
                title="Browser content"
              />
            </ScrollArea>

            {isLoading && !error && (
              <div className="absolute inset-0 bg-white bg-opacity-90 flex items-center justify-center flex-col gap-2">
                <BarLoader color="#666" />
                <span className="text-gray-500 text-xs">Loading...</span>
              </div>
            )}

            {error && (
              <div className="absolute inset-0 bg-white flex items-center justify-center flex-col gap-2">
                <span className="text-red-500">Failed to load page</span>
                <button
                  className="text-blue-500 hover:underline text-sm"
                  type="button"
                  onClick={() => {
                    if (currentUrl) {
                      setIsLoading(true)
                      setError(null)
                      const newUrl = new URL(currentUrl)
                      newUrl.searchParams.set('t', Date.now().toString())
                      setCurrentUrl(newUrl.toString())
                    }
                  }}
                >
                  Try again
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </Panel>
  )
}
