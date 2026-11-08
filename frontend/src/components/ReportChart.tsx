import { useEffect, useRef } from "react";
import { init, use, type EChartsCoreOption } from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
  AriaComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
use([
  BarChart,
  LineChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  AriaComponent,
  SVGRenderer,
]);

export default function ReportChart({
  title,
  description,
  months,
  series,
  unit,
  line = false,
}: {
  title: string;
  description: string;
  months: string[];
  series: { name: string; values: (string | number | null)[] }[];
  unit: string;
  line?: boolean;
}) {
  const element = useRef<HTMLDivElement>(null);
  const instance = useRef<ReturnType<typeof init> | null>(null);
  useEffect(() => {
    if (!element.current) return;
    const chart = init(element.current, undefined, { renderer: "svg" });
    instance.current = chart;
    const resize = () => chart.resize();
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    observer?.observe(element.current);
    window.addEventListener("resize", resize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", resize);
      instance.current = null;
      chart.dispose();
    };
  }, []);
  useEffect(() => {
    const option: EChartsCoreOption = {
      animation: false,
      color: ["#246957", "#af6516", "#4c65a0", "#7b4d88"],
      aria: {
        enabled: true,
        decal: { show: true },
        label: {
          description: `${title}. ${description}. Unidad: ${unit}. Consulte las cifras exactas en la tabla debajo del gráfico.`,
        },
      },
      grid: { left: 20, right: 18, top: 85, bottom: 38, containLabel: true },
      tooltip: {
        trigger: "axis",
        confine: true,
        formatter: (input: unknown) => {
          const items = (Array.isArray(input) ? input : [input]) as {
            seriesIndex: number;
            dataIndex: number;
          }[];
          const escape = (s: unknown) =>
            String(s).replace(
              /[&<>"']/g,
              (ch) =>
                ({
                  "&": "&amp;",
                  "<": "&lt;",
                  ">": "&gt;",
                  '"': "&quot;",
                  "'": "&#39;",
                })[ch]!,
            );
          return items
            .map(
              (p) =>
                `${escape(series[p.seriesIndex]?.name || "")}: ${escape(series[p.seriesIndex]?.values[p.dataIndex] ?? "Sin información")} ${escape(unit)}`,
            )
            .join("<br>");
        },
      },
      legend: {
        type: "scroll",
        top: 0,
        textStyle: { fontSize: 14 },
        pageTextStyle: { fontSize: 14 },
      },
      xAxis: {
        type: "category",
        data: months,
        axisLabel: { fontSize: 13, hideOverlap: true },
      },
      yAxis: { type: "value", name: unit, axisLabel: { fontSize: 13 } },
      series: series.map((s) => ({
        name: s.name,
        type: line ? "line" : "bar",
        connectNulls: false,
        // Solo coordenadas visuales: la cifra exacta de tooltip y tabla permanece textual.
        data: s.values.map((v) =>
          v === null ? null : { value: Number(v), exact: String(v) },
        ),
      })),
    };
    instance.current?.setOption(option, { notMerge: true });
  }, [months, series, unit, line, title, description]);
  const empty = !series.some((s) => s.values.some((v) => v !== null));
  return (
    <section className="report-chart panel" aria-label={title}>
      <h3>{title}</h3>
      <p>
        {description} · {unit}
      </p>
      {empty && <p role="status">No hay datos para este periodo.</p>}
      <div
        ref={element}
        className="echart"
        role="img"
        aria-label={`${title}. ${description}. Cifras exactas disponibles debajo.`}
        hidden={empty}
      />
      <details>
        <summary>Ver cifras del gráfico</summary>
        <div className="report-scroll">
          <table>
            <caption>
              {title} · {unit}
            </caption>
            <thead>
              <tr>
                <th>Mes</th>
                {series.map((s) => (
                  <th key={s.name}>{s.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map((m, i) => (
                <tr key={m}>
                  <th>{m}</th>
                  {series.map((s) => (
                    <td key={s.name}>{s.values[i] ?? "Sin información"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
