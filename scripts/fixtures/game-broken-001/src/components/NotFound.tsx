// Clean file — present in the manifest and on disk. The gate must NOT flag this;
// only the two real defects (missing ./pages/Game import, non-class Game) should fail.
export default function NotFound() {
  return <div className="min-h-screen bg-background">Page not found</div>
}
