export interface GitReviewFile {
  sha: string
  filename: string
  previous_filename: string | null
  status: string
  additions: number
  deletions: number
  changes: number
  patch: string
}
