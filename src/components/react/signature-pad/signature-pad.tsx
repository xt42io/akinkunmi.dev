import type { StrokeOptions } from "perfect-freehand";
import { getStroke } from "perfect-freehand";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { getSvgPathFromStroke } from "./helper";
import { Point } from "./point";

const DPI = 2;

export type SignaturePadProps = Omit<
  React.HTMLAttributes<HTMLCanvasElement>,
  "onChange"
> & {
  onChange?: (_signatureDataUrl: string | null) => void;
  containerClassName?: string;
  disabled?: boolean;
};

export const SignaturePad = ({
  className,
  containerClassName,
  onChange,
  disabled = false,
  ...props
}: SignaturePadProps) => {
  const $el = useRef<HTMLCanvasElement>(null);

  const [isPressed, setIsPressed] = useState(false);
  const [lines, setLines] = useState<Point[][]>([]);
  const [currentLine, setCurrentLine] = useState<Point[]>([]);

  const perfectFreehandOptions = useMemo(() => {
    const size = $el.current
      ? Math.min($el.current.height, $el.current.width) * 0.03
      : 10;

    return {
      size,
      thinning: 0.25,
      streamline: 0.5,
      smoothing: 0.5,
      end: {
        taper: size * 2,
      },
    } satisfies StrokeOptions;
  }, []);

  const onMouseDown = (
    event: React.MouseEvent | React.PointerEvent | React.TouchEvent,
  ) => {
    if (event.cancelable) {
      event.preventDefault();
    }

    setIsPressed(true);

    const point = Point.fromEvent(event, DPI, $el.current);

    setCurrentLine([point]);
  };

  const onMouseMove = (
    event: React.MouseEvent | React.PointerEvent | React.TouchEvent,
  ) => {
    if (event.cancelable) {
      event.preventDefault();
    }

    if (!isPressed) {
      return;
    }

    const point = Point.fromEvent(event, DPI, $el.current);

    if (point.distanceTo(currentLine[currentLine.length - 1]) > 5) {
      setCurrentLine([...currentLine, point]);

      if ($el.current) {
        const ctx = $el.current.getContext("2d");

        if (ctx) {
          ctx.restore();
          ctx.fillStyle = "#2c2c29";
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";

          lines.forEach((line) => {
            const pathData = new Path2D(
              getSvgPathFromStroke(getStroke(line, perfectFreehandOptions)),
            );
            ctx.fill(pathData);
          });

          const pathData = new Path2D(
            getSvgPathFromStroke(
              getStroke([...currentLine, point], perfectFreehandOptions),
            ),
          );
          ctx.fill(pathData);
        }
      }
    }
  };

  const onMouseUp = (
    event: React.MouseEvent | React.PointerEvent | React.TouchEvent,
    addLine = true,
  ) => {
    if (event.cancelable) {
      event.preventDefault();
    }

    setIsPressed(false);

    const point = Point.fromEvent(event, DPI, $el.current);

    const newLines = [...lines];

    if (addLine && currentLine.length > 0) {
      newLines.push([...currentLine, point]);
      setCurrentLine([]);
    }

    setLines(newLines);

    if ($el.current && newLines.length > 0) {
      const ctx = $el.current.getContext("2d");

      if (ctx) {
        ctx.restore();
        ctx.fillStyle = "#2c2c29";
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        newLines.forEach((line) => {
          const pathData = new Path2D(
            getSvgPathFromStroke(getStroke(line, perfectFreehandOptions)),
          );
          ctx.fill(pathData);
        });

        onChange?.($el.current.toDataURL());
        ctx.save();
      }
    }
  };

  const onMouseEnter = (
    event: React.MouseEvent | React.PointerEvent | React.TouchEvent,
  ) => {
    if (event.cancelable) {
      event.preventDefault();
    }

    if ("buttons" in event && event.buttons === 1) {
      onMouseDown(event);
    }
  };

  const onMouseLeave = (
    event: React.MouseEvent | React.PointerEvent | React.TouchEvent,
  ) => {
    if (event.cancelable) {
      event.preventDefault();
    }

    onMouseUp(event, false);
  };

  const onClearClick = () => {
    if ($el.current) {
      const ctx = $el.current.getContext("2d");
      ctx?.clearRect(0, 0, $el.current.width, $el.current.height);
    }

    onChange?.(null);
    setLines([]);
    setCurrentLine([]);
  };

  const onUndoClick = () => {
    if (lines.length === 0) {
      return;
    }

    const newLines = lines.slice(0, -1);
    setLines(newLines);

    if ($el.current) {
      const ctx = $el.current.getContext("2d");
      const { width, height } = $el.current;
      ctx?.clearRect(0, 0, width, height);

      if (ctx) {
        ctx.fillStyle = "#2c2c29";
      }

      newLines.forEach((line) => {
        const pathData = new Path2D(
          getSvgPathFromStroke(getStroke(line, perfectFreehandOptions)),
        );
        ctx?.fill(pathData);
      });

      onChange?.(newLines.length > 0 ? $el.current.toDataURL() : null);
    }
  };

  useEffect(() => {
    const canvas = $el.current;
    if (!canvas) return;
    const resize = () => {
      const width = Math.round(canvas.clientWidth * DPI);
      const height = Math.round(canvas.clientHeight * DPI);
      if (!width || !height || (width === canvas.width && height === canvas.height)) return;
      const previous = document.createElement("canvas");
      previous.width = canvas.width;
      previous.height = canvas.height;
      if (canvas.width && canvas.height) previous.getContext("2d")?.drawImage(canvas, 0, 0);
      const scaleX = width / (canvas.width || width);
      const scaleY = height / (canvas.height || height);
      canvas.width = width;
      canvas.height = height;
      if (previous.width && previous.height) canvas.getContext("2d")?.drawImage(previous, 0, 0, width, height);
      setLines(lines => lines.map(line => line.map(point => new Point(point.x * scaleX, point.y * scaleY, point.timestamp))));
      setCurrentLine(line => line.map(point => new Point(point.x * scaleX, point.y * scaleY, point.timestamp)));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={[
        "relative block",
        containerClassName,
        disabled ? "pointer-events-none opacity-50" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <canvas
        ref={$el}
        className={["relative block", className].filter(Boolean).join(" ")}
        style={{ touchAction: "none" }}
        onPointerMove={(event) => onMouseMove(event)}
        onPointerDown={(event) => onMouseDown(event)}
        onPointerUp={(event) => onMouseUp(event)}
        onPointerLeave={(event) => onMouseLeave(event)}
        onPointerEnter={(event) => onMouseEnter(event)}
        {...props}
      />

      <div className="absolute bottom-2 right-2 flex gap-2">
        <button
          type="button"
          className="text-xs text-muted hover:text-ink transition-colors"
          onClick={() => onClearClick()}
        >
          Clear
        </button>
      </div>

      {lines.length > 0 && (
        <div className="absolute bottom-2 left-2 flex gap-2">
          <button
            type="button"
            title="undo"
            className="text-xs text-muted hover:text-ink transition-colors"
            onClick={() => onUndoClick()}
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
};

export { type SignaturePadProps as Props };
