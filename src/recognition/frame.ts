import {
  RECOGNITION_FRAME_HEIGHT,
  RECOGNITION_FRAME_WIDTH,
  RECOGNITION_MAX_FRAME_BYTES,
} from './protocol'

const JPEG_QUALITY = 0.78

export function createRecognitionCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = RECOGNITION_FRAME_WIDTH
  canvas.height = RECOGNITION_FRAME_HEIGHT
  return canvas
}

export async function encodeRecognitionFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): Promise<ArrayBuffer | null> {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null

  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('영상 프레임을 처리할 수 없어요.')

  context.drawImage(
    video,
    0,
    0,
    RECOGNITION_FRAME_WIDTH,
    RECOGNITION_FRAME_HEIGHT,
  )

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  )

  if (!blob) throw new Error('영상 프레임을 JPEG로 변환하지 못했어요.')
  if (blob.size > RECOGNITION_MAX_FRAME_BYTES) {
    throw new Error('영상 프레임 크기가 서버 제한을 넘었어요.')
  }

  return blob.arrayBuffer()
}
