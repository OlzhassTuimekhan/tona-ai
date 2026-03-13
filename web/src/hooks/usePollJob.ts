import { useEffect } from 'react'
import { getJob, type JobPoll } from '@/api/client'

export function usePollJob(
  taskId: string | null,
  onDone: (j: JobPoll) => void,
): void {
  useEffect(() => {
    if (!taskId) return
    let cancelled = false
    const tick = async () => {
      try {
        const j = await getJob(taskId)
        if (cancelled) return
        onDone(j)
        if (j.status === 'pending' || j.status === 'processing') {
          setTimeout(tick, 2000)
        }
      } catch (e) {
        if (!cancelled)
          onDone({
            task_id: taskId,
            status: 'failed',
            error: String(e),
          })
      }
    }
    void tick()
    return () => {
      cancelled = true
    }
  }, [taskId, onDone])
}
