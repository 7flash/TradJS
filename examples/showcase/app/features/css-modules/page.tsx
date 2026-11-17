import styles from "./card.module.css";

// This import is resolved during server rendering.
export default function CSSModulesPage() {
  return (
    <div className="page">
      <h1>Server CSS Modules</h1>
      <article className={styles.card}>
        <h2 className={styles.heading}>Locally scoped</h2>
        <p>
          The server renders mapped class names.
          No page.client.tsx or hydration is required.
        </p>
      </article>
    </div>
  );
}
