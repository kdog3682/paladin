import { closedModal, type ModalKind, type ModalState } from "../store/slices/ui"
import { S, useEditor } from "../store/useEditor"

/* kinds that start with a query line (fuzzy pickers) */
const PICKERS: ModalKind[] = ["loader", "icons"]

export function openModal(kind: ModalKind, patch: Partial<ModalState> = {}): void {
  const typing = PICKERS.includes(kind)
  useEditor.setState(s => ({
    modal: { ...closedModal, kind, ...patch },
    mode: typing ? "modal-text" : "modal",
    prevMode: s.mode === "modal" || s.mode === "modal-text" ? s.prevMode : s.mode,
  }))
}

export function closeModal(): void {
  useEditor.setState({ modal: closedModal, mode: "normal" })
}

export function patchModal(patch: Partial<ModalState>): void {
  useEditor.setState(s => ({ modal: { ...s.modal, ...patch } }))
}

/* modal-text while a filter, input line or picker query takes keys; modal otherwise */
export function syncModalMode(): void {
  const { modal } = S()
  if (!modal.kind) return
  const typing = PICKERS.includes(modal.kind) || modal.typing
  useEditor.setState({ mode: typing ? "modal-text" : "modal" })
}
