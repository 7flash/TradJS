import type { Child } from "tradjs/client";

// A nested layout also receives the matched pathname.
export default function PathLayout({
  children,
  pathname,
}: {
  children: Child;
  pathname: string;
}) {
  return (
    <section className="page">
      <div className="demo-card">
        <h2>Layout pathname</h2>
        <p>Read by layout.tsx during server rendering:</p>
        <code>{pathname}</code>
      </div>
      {children}
    </section>
  );
}
