import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';

export interface MetricSlide {
  id: string;
  title: string;
  value: string;
  description: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  color?: 'accent' | 'positive' | 'critical' | 'warning';
}

interface MetricCarouselProps {
  slides: MetricSlide[];
  autoPlay?: boolean;
  autoPlayInterval?: number;
  className?: string;
}

export function MetricCarousel({
  slides,
  autoPlay = true,
  autoPlayInterval = 5000,
  className = '',
}: MetricCarouselProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [direction, setDirection] = useState(0);

  const nextSlide = useCallback(() => {
    setDirection(1);
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  }, [slides.length]);

  const prevSlide = useCallback(() => {
    setDirection(-1);
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
  }, [slides.length]);

  const goToSlide = useCallback((index: number) => {
    setDirection(index > currentSlide ? 1 : -1);
    setCurrentSlide(index);
  }, [currentSlide]);

  // Auto-play functionality
  useEffect(() => {
    if (!autoPlay || isHovered || slides.length <= 1) return;

    const interval = setInterval(nextSlide, autoPlayInterval);
    return () => clearInterval(interval);
  }, [autoPlay, autoPlayInterval, isHovered, nextSlide, slides.length]);

  if (slides.length === 0) return null;

  const slide = slides[currentSlide];

  const getTrendIcon = () => {
    switch (slide.trend) {
      case 'up':
        return <TrendingUp size={16} />;
      case 'down':
        return <TrendingDown size={16} />;
      default:
        return <Minus size={16} />;
    }
  };

  const getTrendClass = () => {
    switch (slide.trend) {
      case 'up':
        return 'MetricCarousel__trend--up';
      case 'down':
        return 'MetricCarousel__trend--down';
      default:
        return 'MetricCarousel__trend--neutral';
    }
  };

  const getColorClass = () => {
    switch (slide.color) {
      case 'positive':
        return 'MetricCarousel__slide--positive';
      case 'critical':
        return 'MetricCarousel__slide--critical';
      case 'warning':
        return 'MetricCarousel__slide--warning';
      default:
        return 'MetricCarousel__slide--accent';
    }
  };

  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 100 : -100,
      opacity: 0,
      scale: 0.95,
    }),
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
    },
    exit: (direction: number) => ({
      x: direction < 0 ? 100 : -100,
      opacity: 0,
      scale: 0.95,
    }),
  };

  return (
    <div
      className={`MetricCarousel ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="MetricCarousel__container">
        <AnimatePresence initial={false} custom={direction} mode="wait">
          <motion.div
            key={slide.id}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              x: { type: 'spring', stiffness: 300, damping: 30 },
              opacity: { duration: 0.2 },
              scale: { duration: 0.2 },
            }}
            className={`MetricCarousel__slide ${getColorClass()}`}
          >
            <div className="MetricCarousel__content">
              <h3 className="MetricCarousel__title">{slide.title}</h3>
              <div className="MetricCarousel__valueWrap">
                <span className="MetricCarousel__value">{slide.value}</span>
                {slide.trend && (
                  <span className={`MetricCarousel__trend ${getTrendClass()}`}>
                    {getTrendIcon()}
                    {slide.trendValue && <span>{slide.trendValue}</span>}
                  </span>
                )}
              </div>
              <p className="MetricCarousel__description">{slide.description}</p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {slides.length > 1 && (
        <>
          <button
            className="MetricCarousel__arrow MetricCarousel__arrow--prev"
            onClick={prevSlide}
            aria-label="Previous metric"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            className="MetricCarousel__arrow MetricCarousel__arrow--next"
            onClick={nextSlide}
            aria-label="Next metric"
          >
            <ChevronRight size={20} />
          </button>

          <div className="MetricCarousel__dots">
            {slides.map((_, index) => (
              <button
                key={index}
                className={`MetricCarousel__dot ${index === currentSlide ? 'is-active' : ''}`}
                onClick={() => goToSlide(index)}
                aria-label={`Go to metric ${index + 1}`}
                aria-current={index === currentSlide ? 'true' : undefined}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
