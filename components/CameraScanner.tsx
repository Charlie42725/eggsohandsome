'use client'

import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'

interface CameraScannerProps {
  isOpen: boolean
  onClose: () => void
  onScan: (code: string) => void
}

export default function CameraScanner({ isOpen, onClose, onScan }: CameraScannerProps) {
  const [error, setError] = useState<string | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hasScannedRef = useRef<boolean>(false)
  const [manualInput, setManualInput] = useState('')

  useEffect(() => {
    if (isOpen) {
      hasScannedRef.current = false
      initScanner()
    }
    return () => {
      stopScanner()
    }
  }, [isOpen])

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop()
        scannerRef.current.clear()
      } catch (err) {
        // Ignore stop errors
      }
      scannerRef.current = null
    }
    setIsScanning(false)
  }

  const initScanner = async () => {
    try {
      setError(null)
      await new Promise(resolve => setTimeout(resolve, 150))

      if (!containerRef.current) return

      scannerRef.current = new Html5Qrcode('camera-scanner-region', {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.QR_CODE,
        ],
        verbose: false,
      })

      await scannerRef.current.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 280, height: 180 } },
        (decodedText) => {
          if (hasScannedRef.current) return
          hasScannedRef.current = true

          if (navigator.vibrate) navigator.vibrate(100)
          onScan(decodedText)
          onClose()
        },
        () => {}
      )

      setIsScanning(true)
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setError('請允許相機權限')
      } else if (err.name === 'NotFoundError') {
        setError('找不到相機')
      } else {
        setError('無法啟動相機')
      }
    }
  }

  const handleClose = async () => {
    await stopScanner()
    onClose()
  }

  const handleManualSubmit = () => {
    if (manualInput.trim() && !hasScannedRef.current) {
      hasScannedRef.current = true
      onScan(manualInput.trim())
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="relative w-full max-w-md mx-4 bg-slate-900 rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">📷 相機掃描</h2>
          <button
            onClick={handleClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Camera Area */}
        <div ref={containerRef} className="relative bg-black">
          <div id="camera-scanner-region" style={{ minHeight: '300px' }} />
        </div>

        {/* Footer */}
        <div className="p-4">
          {error ? (
            <div className="text-center">
              <p className="text-red-400 mb-3">{error}</p>
              <button
                onClick={initScanner}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
              >
                重試
              </button>
            </div>
          ) : (
            <p className="text-center text-slate-400 text-sm">
              {isScanning ? '將條碼對準框內' : '正在啟動相機...'}
            </p>
          )}

          {/* Manual Input */}
          {isScanning && (
            <div className="mt-4 pt-4 border-t border-slate-700">
              <div className="text-xs text-slate-400 mb-2">掃不到？手動輸入：</div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
                  placeholder="輸入條碼..."
                  className="flex-1 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  onClick={handleManualSubmit}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                >
                  確認
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
