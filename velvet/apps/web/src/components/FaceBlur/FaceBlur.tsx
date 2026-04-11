import { useState, useCallback } from 'react'
import { useFaceBlur } from './useFaceBlur.ts'

interface FaceBlurProps {
  onBlurredFile: (file: File) => void
  accept?: string
}

export function FaceBlur({ onBlurredFile, accept = 'image/*' }: FaceBlurProps) {
  const [preview, setPreview] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const { blurFaces } = useFaceBlur()

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setProcessing(true)
    try {
      const { blob, faceCount } = await blurFaces(file)
      const blurredFile = new File([blob], file.name, { type: 'image/jpeg' })
      const previewUrl = URL.createObjectURL(blob)
      setPreview(previewUrl)
      onBlurredFile(blurredFile)
      if (faceCount === 0) {
        alert("No clear face detected. For best verification, please use a portrait photo.")
      }
    } catch (err) {
      console.error('Face blur failed', err)
      // Fallback: use original (user can still upload, blur is best-effort)
      onBlurredFile(file)
    } finally {
      setProcessing(false)
    }
  }, [blurFaces, onBlurredFile])

  return (
    <div className="face-blur-container">
      <label className="upload-label">
        <input type="file" accept={accept} onChange={handleFile} disabled={processing} style={{ display: 'none' }} />
        <div className="upload-box">
          {processing ? 'Processing...' : 'Upload & Auto-Blur'}
        </div>
      </label>
      
      {preview && (
        <div className="preview-container">
          <p>Preview (Faces Blurred):</p>
          <img src={preview} alt="Blurred Preview" style={{ maxWidth: '100%', borderRadius: '8px' }} />
        </div>
      )}
    </div>
  )
}
