export default function NotFoundDemo() {
  return (
    <div className="page">
      <h1>Not-found boundaries</h1>
      <p>
        A page can deliberately return HTTP 404 by calling
        notFound() from tradjs/server.
      </p>
      <a href="/features/not-found/missing">
        Trigger notFound()
      </a>
    </div>
  );
}
