import { Keyboard } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

interface Props {
  open: boolean
  onClose: () => void
}

const SHORTCUTS = [
  ['Space', '播放 / 暂停复盘'],
  ['← / →', '复盘单步前进 / 后退'],
  ['R', '立即刷新当前 K 线'],
  ['Esc', '退出当前画线或标注工具'],
  ['Delete', '删除选中的图形'],
  ['?', '打开快捷键帮助'],
]

export function ShortcutsDialog({ open, onClose }: Props) {
  return (
    <Modal
      open={open}
      title="快捷键"
      onClose={onClose}
      footer={<Button variant="primary" onClick={onClose}>知道了</Button>}
    >
      <div className="space-y-2">
        {SHORTCUTS.map(([key, label]) => (
          <div key={key} className="flex items-center justify-between rounded border border-edge bg-panel-soft px-3 py-2 text-xs">
            <span className="text-ink-muted">{label}</span>
            <kbd className="inline-flex min-w-12 items-center justify-center rounded border border-edge bg-panel px-2 py-1 font-mono text-2xs text-ink">
              {key}
            </kbd>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 rounded border border-accent/30 bg-accent/10 px-3 py-2 text-2xs text-accent">
        <Keyboard className="h-3.5 w-3.5 shrink-0" />
        输入框获得焦点时不会触发快捷键，避免干扰笔记编辑。
      </div>
    </Modal>
  )
}
