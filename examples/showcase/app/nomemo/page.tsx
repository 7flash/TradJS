
// examples/showcase/app/nomemo/page.tsx

export default function NoMemoPage() {
    return (
        <div className="page">
            <div className="page-header">
                <h1 className="page-title">No implicit component memo</h1>
                <p className="page-description">
                    This page proves that calling render(&lt;App /&gt;) must re-run function components,
                    even when props are unchanged, because components may read global state.
                </p>
            </div>

            <div id="nomemo-root" />
        </div>
    );
}
