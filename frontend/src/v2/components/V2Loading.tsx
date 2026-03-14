import { motion } from 'framer-motion';

interface V2LoadingProps {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
  stage?: string;
  className?: string;
}

export function V2Loading({
  size = 'md',
  message,
  stage,
  className = '',
}: V2LoadingProps) {
  const sizeMap = {
    sm: { container: 32, ring: 3 },
    md: { container: 48, ring: 4 },
    lg: { container: 64, ring: 5 },
  };

  const { container, ring } = sizeMap[size];

  return (
    <div className={`V2Loading ${className}`}>
      <div
        className="V2Loading__container"
        style={{ width: container, height: container }}
      >
        {/* Outer ring - clockwise */}
        <motion.div
          className="V2Loading__ring V2Loading__ring--outer"
          style={{ borderWidth: ring }}
          animate={{ rotate: 360 }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
        {/* Inner ring - counter-clockwise */}
        <motion.div
          className="V2Loading__ring V2Loading__ring--inner"
          style={{ borderWidth: ring }}
          animate={{ rotate: -360 }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      </div>
      {(message || stage) && (
        <div className="V2Loading__text">
          {stage && <span className="V2Loading__stage">{stage}</span>}
          {message && <span className="V2Loading__message">{message}</span>}
        </div>
      )}
    </div>
  );
}

// Full-screen loading overlay variant
export function V2LoadingOverlay({
  message,
  stage,
}: Omit<V2LoadingProps, 'size' | 'className'>) {
  return (
    <div className="V2LoadingOverlay">
      <V2Loading size="lg" message={message} stage={stage} />
    </div>
  );
}

// Inline loading for buttons/forms
export function V2LoadingInline() {
  return (
    <span className="V2LoadingInline">
      <span className="V2LoadingInline__ring" />
    </span>
  );
}
