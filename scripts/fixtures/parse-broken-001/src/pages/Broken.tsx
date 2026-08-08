// DEFECT: truncated / syntactically invalid file (unclosed JSX + missing braces).
// The PARSE rung (esbuild) must reject this so it never lands and blanks the build.
export default function Broken() {
  const [count, setCount] = useState(0
  return (
    <div className="min-h-screen">
      <button onClick={() => setCount(count + 1)}>Count: {count
