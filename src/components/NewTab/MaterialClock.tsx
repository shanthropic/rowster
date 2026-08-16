import { useEffect, useRef, useState } from "react";
import { Clock, Smartphone } from "lucide-react";

interface MaterialClockProps {
  userName?: string;
  greeting?: string;
}

type ClockVariant = "analog" | "digital";

const SCALLOP_PATH_DATA =
  "M93.6379 63.9405C89.7543 78.4344 78.4333 89.7554 63.9394 93.639l-7.4405 1.9937c-22.4055 6.0033-35.702 29.0333-29.6984 51.4393l1.9196 7.164c3.8837 14.494-.2601 29.959-10.8704 40.569l-5.5482 5.548c-16.402 16.402-16.402 42.995 0 59.397l5.6221 5.622c10.6102 10.611 14.754 26.075 10.8704 40.569l-1.9936 7.441c-6.0036 22.405 7.2929 45.435 29.6985 51.439l7.4406 1.994c14.4939 3.883 25.8149 15.204 29.6985 29.698l1.9942 7.443c6.0038 22.405 29.0338 35.702 51.4388 29.698l7.442-1.994c14.494-3.883 29.959.26 40.569 10.871l5.271 5.271c16.402 16.402 42.995 16.402 59.397 0l5.347-5.347c10.61-10.61 26.075-14.754 40.569-10.87l7.717 2.068c22.405 6.003 45.435-7.293 51.439-29.699l1.993-7.439c3.884-14.494 15.205-25.815 29.699-29.699l7.441-1.994c22.406-6.003 35.702-29.033 29.699-51.439l-2.068-7.718c-3.884-14.493.26-29.958 10.87-40.569l5.346-5.346c16.402-16.402 16.402-42.995 0-59.397l-5.272-5.272c-10.61-10.61-14.754-26.075-10.87-40.569l1.994-7.441c6.003-22.406-7.293-45.436-29.699-51.4398l-7.441-1.9939c-14.494-3.8836-25.815-15.2046-29.699-29.6984l-1.993-7.4395c-6.004-22.4056-29.034-35.702-51.439-29.6985l-7.441 1.9937c-14.494 3.8836-29.959-.2601-40.569-10.8704l-5.623-5.6227c-16.402-16.402-42.995-16.402-59.397 0l-5.547 5.5476c-10.61 10.6102-26.075 14.754-40.569 10.8704l-7.166-1.92c-22.405-6.0036-45.435 7.2929-51.4388 29.6985l-1.9943 7.4425Z";

export default function MaterialClock({
  userName = "User",
  greeting,
}: MaterialClockProps) {
  const [variant, setVariant] = useState<ClockVariant>(() => {
    return (localStorage.getItem("rowster_clock_variant") as ClockVariant) || "analog";
  });

  const hourRef = useRef<HTMLDivElement | null>(null);
  const minuteRef = useRef<HTMLDivElement | null>(null);
  const secondRef = useRef<HTMLDivElement | null>(null);

  const rotationsRef = useRef({
    secondTotal: 0,
    minuteTotal: 0,
    hourTotal: 0,
    initialized: false,
  });

  const [dateInfo, setDateInfo] = useState(() => {
    const d = new Date();
    const h = d.getHours();
    return {
      hours12: (h % 12 || 12).toString(),
      minutes: d.getMinutes().toString().padStart(2, "0"),
      period: h < 12 ? "AM" : "PM",
      formattedDate: d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
      shortDate: d.toLocaleDateString("en-US", {
        weekday: "short",
        day: "numeric",
      }),
    };
  });

  useEffect(() => {
    const rotateHand = (
      el: HTMLElement | null,
      targetAngle: number,
      currentTotal: number,
      isReset: boolean
    ): number => {
      if (!el) return currentTotal;

      let nextTotal: number;
      const diff = targetAngle - (currentTotal % 360);

      if (!rotationsRef.current.initialized) {
        nextTotal = targetAngle;
        el.style.transition = "none";
      } else if (isReset && Math.abs(diff + 360) < Math.abs(diff)) {
        nextTotal = targetAngle + (Math.floor(currentTotal / 360) + 1) * 360;
        el.style.transition = "transform 1s ease";
      } else {
        nextTotal = targetAngle + Math.floor(currentTotal / 360) * 360;
        el.style.transition = "transform 1s ease";
      }

      el.style.transform = `rotate(${nextTotal}deg)`;
      return nextTotal;
    };

    const updateClock = () => {
      const now = new Date();
      const sec = now.getSeconds();
      const min = now.getMinutes();
      const hr = now.getHours();

      const secAngle = sec * 6;
      const minAngle = min * 6 + sec / 10;
      const hrAngle = 30 * (hr % 12) + min / 2;

      const secReset = sec === 0;
      const minReset = min === 0 && sec === 0;
      const hrReset = hr % 12 === 0 && min === 0 && sec === 0;

      rotationsRef.current.secondTotal = rotateHand(
        secondRef.current,
        secAngle,
        rotationsRef.current.secondTotal,
        secReset
      );

      rotationsRef.current.minuteTotal = rotateHand(
        minuteRef.current,
        minAngle,
        rotationsRef.current.minuteTotal,
        minReset
      );

      rotationsRef.current.hourTotal = rotateHand(
        hourRef.current,
        hrAngle,
        rotationsRef.current.hourTotal,
        hrReset
      );

      rotationsRef.current.initialized = true;

      setDateInfo({
        hours12: (hr % 12 || 12).toString(),
        minutes: min.toString().padStart(2, "0"),
        period: hr < 12 ? "AM" : "PM",
        formattedDate: now.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        }),
        shortDate: now.toLocaleDateString("en-US", {
          weekday: "short",
          day: "numeric",
        }),
      });
    };

    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, [variant]);

  const toggleVariant = () => {
    const next = variant === "analog" ? "digital" : "analog";
    setVariant(next);
    localStorage.setItem("rowster_clock_variant", next);
    rotationsRef.current.initialized = false;
  };

  return (
    <div className="newtab-hero-left">
      <div className="clock-widget-container">
        {variant === "analog" ? (
          <div className="clock-analog-display">
            {/* Scalloped Vector Clock Face */}
            <svg
              fill="none"
              height="100%"
              viewBox="0 0 461 461"
              width="100%"
              xmlns="http://www.w3.org/2000/svg"
              className="clock-canvas-svg"
              aria-hidden="true"
            >
              <path
                className="clock-surface-path"
                clipRule="evenodd"
                fillRule="evenodd"
                d={SCALLOP_PATH_DATA}
              />
            </svg>

            {/* Pivot Center Point and Layered Hands */}
            <div className="clock-pivot-anchor">
              <div ref={hourRef} className="clock-hand clock-hand-hour" />
              <div ref={minuteRef} className="clock-hand clock-hand-minute" />
              <div ref={secondRef} className="clock-hand clock-hand-second" />
            </div>
          </div>
        ) : (
          <div className="clock-digital-display">
            <svg
              fill="none"
              height="100%"
              viewBox="60 0 460 450"
              width="100%"
              xmlns="http://www.w3.org/2000/svg"
              className="clock-canvas-svg"
              aria-hidden="true"
            >
              {/* Oval Capsule Background */}
              <rect
                className="clock-surface-path"
                height="350"
                rx="175"
                width="460"
                x="60"
                y="40"
              />

              {/* Date Text */}
              <text
                x="290"
                y="125"
                textAnchor="middle"
                className="clock-digital-date"
              >
                {dateInfo.shortDate}
              </text>

              {/* Digital Time Text */}
              <text
                x="290"
                y="255"
                textAnchor="middle"
                className="clock-digital-time"
              >
                {dateInfo.hours12}:{dateInfo.minutes}
              </text>

              {/* AM/PM Indicator */}
              <text
                x="290"
                y="330"
                textAnchor="middle"
                className="clock-digital-period"
              >
                {dateInfo.period}
              </text>
            </svg>
          </div>
        )}
      </div>

      <div className="clock-meta-info">
        <div className="clock-meta-header">
          <h2 className="clock-greeting-text">{greeting ?? `Hi there, ${userName}`}</h2>
          <button
            type="button"
            className="clock-variant-toggle"
            onClick={toggleVariant}
            aria-label={`Switch to ${variant === "analog" ? "Digital" : "Analog"} clock`}
          >
            {variant === "analog" ? <Smartphone size={15} /> : <Clock size={15} />}
            <span>{variant === "analog" ? "Digital" : "Analog"}</span>
          </button>
        </div>
        <p className="clock-date-text">{dateInfo.formattedDate}</p>
      </div>
    </div>
  );
}
