// deliberately NOT reachable from index.html -> src/main.tsx, so pointing
// webrun at this file must fall back to the virtual shell rather than serving
// the project's real app
export default function Orphan() {
  return <h1 id="greeting">orphan</h1>
}
