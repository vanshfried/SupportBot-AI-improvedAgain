import { useEffect, useState } from "react";
import API from "../../../API/api";
import { useNavigate } from "react-router-dom";
import styles from "./styles/analytics.module.css";

export default function DepartmentOverview() {
  const [agents, setAgents] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    API.get("/analytics/agent-performance").then((res) => {
      setAgents(res.data);
    });
  }, []);

  // ❌ remove "No Department" (superadmin etc.)
  const validAgents = agents.filter(
    (a) => a.department && a.department !== "No Department",
  );

  // 🔥 group + aggregate per department
  const departments = Object.values(
    validAgents.reduce((acc, agent) => {
      const dept = agent.department;

      if (!acc[dept]) {
        acc[dept] = {
          name: dept,
          total_messages: 0,
          total_closed: 0,
          avg_response_sum: 0,
          first_response_sum: 0,
          count: 0,
        };
      }

      // 📩 totals
      acc[dept].total_messages += agent.message_count;
      acc[dept].total_closed += agent.conversations_closed;

      // ⏱️ only include active agents in avg
      if (agent.message_count > 0) {
        acc[dept].avg_response_sum += agent.avg_response_time;
        acc[dept].first_response_sum += agent.first_response_time;
        acc[dept].count += 1;
      }

      return acc;
    }, {}),
  ).map((d) => ({
    ...d,
    avg_response: d.count ? Math.round(d.avg_response_sum / d.count) : 0,
    first_response: d.count ? Math.round(d.first_response_sum / d.count) : 0,
  }));

  const formatTime = (sec) => {
    if (!sec) return "—";
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m`;
    return `${Math.floor(sec / 3600)}h`;
  };

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>📊 Department Overview</h2>

      <div className={styles.grid}>
        {departments.map((d) => (
          <div
            key={d.name}
            onClick={() =>
              navigate(`/analytics/departments/${encodeURIComponent(d.name)}`)
            }
            className={styles.card}
          >
            {/* Header */}
            <div className={styles.header}>
              <span className={styles.name}>🏢 {d.name}</span>
            </div>

            {/* Main Stats */}
            <div className={styles.statsRow}>
              <div className={styles.statBlock}>
                <span className={styles.label}>Messages</span>
                <span className={styles.value}>{d.total_messages}</span>
              </div>

              <div className={styles.statBlock}>
                <span className={styles.label}>Closed</span>
                <span className={styles.value}>{d.total_closed}</span>
              </div>
            </div>

            {/* Bottom Metrics */}
            <div className={styles.metric}>
              ⏱ Avg
              <span
                className={
                  d.avg_response < 60
                    ? styles.green
                    : d.avg_response < 180
                      ? styles.orange
                      : styles.red
                }
              >
                {formatTime(d.avg_response)}
              </span>
            </div>

            <div className={styles.metric}>
              ⚡ First
              <span
                className={
                  d.first_response < 60
                    ? styles.green
                    : d.first_response < 180
                      ? styles.orange
                      : styles.red
                }
              >
                {formatTime(d.first_response)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>);

}
