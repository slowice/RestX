import { useSyncExternalStore } from 'react'
import type { CodeReviewResult, GitCodeMergeRequestList, GitCodeMergeRequestSummary, ReviewCategory, ReviewSeverity, ReviewSourcePreview, ReviewZone } from '../shared/contracts/code-review'

type ReviewSession = {
  zone: ReviewZone
  url: string
  requirements: string
  status: 'idle' | 'loading' | 'ready' | 'reviewing' | 'completed' | 'error'
  preview: ReviewSourcePreview | null
  result: CodeReviewResult | null
  error: string
  severity: ReviewSeverity | 'all'
  category: ReviewCategory | 'all'
  mergeRequestList: GitCodeMergeRequestList | null
  mergeRequestListStatus: 'loading' | 'ready' | 'error'
  mergeRequestListError: string
}

// Feature-owned memory survives route unmounts; source content is not persisted to disk.
let session: ReviewSession = {
  zone: 'blue', url: '', requirements: '', status: 'idle', preview: null, result: null, error: '',
  severity: 'all', category: 'all', mergeRequestList: null, mergeRequestListStatus: 'loading', mergeRequestListError: ''
}
const listeners = new Set<() => void>()
let loadingMergeRequests = false

function update(patch: Partial<ReviewSession>): void {
  session = { ...session, ...patch }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useReviewSession(): ReviewSession {
  return useSyncExternalStore(subscribe, () => session)
}

function busy(): boolean { return session.status === 'loading' || session.status === 'reviewing' }
function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : '操作失败，请稍后重试。'
}

function withReviewResult(list: GitCodeMergeRequestList | null, result: CodeReviewResult | null): GitCodeMergeRequestList | null {
  if (!list || !result) return list
  return { ...list, mergeRequests: list.mergeRequests.map((mr) => mr.sourceId === result.sourceId
    ? { ...mr, review: { status: result.findings.length ? 'issues' : 'passed', findingCount: result.findings.length, analyzedAt: result.analyzedAt } }
    : mr) }
}

export async function loadMyMergeRequests(): Promise<void> {
  if (loadingMergeRequests) return
  loadingMergeRequests = true
  update({ mergeRequestListStatus: 'loading', mergeRequestListError: '' })
  try {
    const next = await window.restx.codeReview.listMyGitCodeMergeRequests()
    // A list request started before a review finished must not erase its fresh result.
    update({ mergeRequestList: withReviewResult(next, session.result), mergeRequestListStatus: 'ready' })
  } catch (reason) {
    update({ mergeRequestListError: errorMessage(reason), mergeRequestListStatus: 'error' })
  } finally {
    loadingMergeRequests = false
  }
}

export function setUrl(url: string): void {
  if (busy()) return
  update({ url, preview: null, result: null, error: '', status: 'idle', severity: 'all', category: 'all' })
}

export function chooseZone(zone: ReviewZone): void {
  if (busy() || zone === session.zone) return
  setUrl('')
  update({ zone })
}

export function setRequirements(requirements: string): void {
  if (!busy()) update({ requirements })
}
export function setSeverity(severity: ReviewSession['severity']): void { update({ severity }) }
export function setCategory(category: ReviewSession['category']): void { update({ category }) }

export async function loadPreview(sourceUrl = session.url.trim()): Promise<void> {
  if (!sourceUrl || busy()) return
  const zone = session.zone
  update({ url: sourceUrl, status: 'loading', error: '', preview: null, result: null, severity: 'all', category: 'all' })
  try {
    const preview = await window.restx.codeReview.previewSource({ url: sourceUrl, zone })
    update({ preview, status: 'ready' })
  } catch (reason) {
    update({ error: errorMessage(reason), status: 'error' })
  }
}

export async function runReview(force = false): Promise<void> {
  if (!session.preview || busy()) return
  const input = { url: session.url.trim(), zone: session.zone, requirements: session.requirements.trim(), force }
  update({ status: 'reviewing', error: '', result: null })
  try {
    const result = await window.restx.codeReview.run(input)
    update({ result, mergeRequestList: withReviewResult(session.mergeRequestList, result), status: 'completed' })
  } catch (reason) {
    update({ error: errorMessage(reason), status: 'error' })
  }
}

export function selectMergeRequest(mergeRequest: GitCodeMergeRequestSummary): void {
  void loadPreview(mergeRequest.locator.webUrl)
}
