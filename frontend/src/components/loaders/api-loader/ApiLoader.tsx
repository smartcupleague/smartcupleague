import styles from './ApiLoader.module.scss';

function ApiLoader() {
  return (
    <div className={styles.loaderContainer}>
      <div className={styles.spinner}></div>
      <p className={styles.text}>Connecting...</p>
    </div>
  );
}

export { ApiLoader };
