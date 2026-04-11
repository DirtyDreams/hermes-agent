import { useRef, useCallback } from 'react'

// Lazy load mediapipe to avoid blocking initial render
let faceDetectionModule: any = null

export async function loadFaceDetection() {
  if (faceDetectionModule) return faceDetectionModule
  const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision')
  const filesetResolver = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
  )
  faceDetectionModule = await FaceDetector.createFromOptions(filesetResolver, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
    },
    runningMode: 'IMAGE',
    minDetectionConfidence: 0.5,
  })
  return faceDetectionModule
}

export function useFaceBlur() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const blurFaces = useCallback(async (
    imageFile: File
  ): Promise<{ blob: Blob; faceCount: number }> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(imageFile)
      img.onload = async () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = img.width
          canvas.height = img.height
          const ctx = canvas.getContext('2d')!
          ctx.drawImage(img, 0, 0)

          const detector = await loadFaceDetection()
          const results = detector.detect(img)

          for (const detection of results.detections) {
            const { originX, originY, width, height } = detection.boundingBox!
            // Blur by drawing pixelated version of detected region
            const padding = 20
            const x = Math.max(0, originX - padding)
            const y = Math.max(0, originY - padding)
            const w = Math.min(img.width - x, width + padding * 2)
            const h = Math.min(img.height - y, height + padding * 2)

            // Save, scale down and back up (pixelate), clip to box
            ctx.save()
            ctx.beginPath()
            ctx.rect(x, y, w, h)
            ctx.clip()
            // Draw at 5% size then scale back up = pixelation blur effect
            const offscreen = document.createElement('canvas')
            offscreen.width = Math.max(1, Math.floor(w * 0.05))
            offscreen.height = Math.max(1, Math.floor(h * 0.05))
            const offCtx = offscreen.getContext('2d')!
            offCtx.drawImage(canvas, x, y, w, h, 0, 0, offscreen.width, offscreen.height)
            ctx.imageSmoothingEnabled = false
            ctx.drawImage(offscreen, x, y, w, h)
            ctx.restore()
          }

          URL.revokeObjectURL(url)
          canvas.toBlob((blob) => {
            if (blob) resolve({ blob, faceCount: results.detections.length })
            else reject(new Error('Failed to create blurred image'))
          }, 'image/jpeg', 0.9)
        } catch (err) {
          reject(err)
        }
      }
      img.onerror = reject
      img.src = url
    })
  }, [])

  return { blurFaces, canvasRef }
}
