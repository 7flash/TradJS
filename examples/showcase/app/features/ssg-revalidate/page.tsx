// Real declarative SSG revalidation, in seconds.
export const ssg = { revalidate: 30 };

export default function RevalidationPage() {
  const generatedAt = new Date().toISOString();

  return (
    <div className="page">
      <h1>SSG with revalidation</h1>
      <p>HTML generated at: <time>{generatedAt}</time></p>
      <p>
        Reload within 30 seconds to observe cached HTML.
        After the TTL, make another request and compare
        the timestamp to observe regeneration.
      </p>
      <p>
        This uses the framework cache. It does not call
        setPrerendered() or clearSSGCache().
      </p>
    </div>
  );
}
