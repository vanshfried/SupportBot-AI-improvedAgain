import { useEffect, useState } from "react";
import API from "../../../API/api";
import { useParams } from "react-router-dom";
import styles from "./styles/DepartmentDetails.module.css";

export default function DepartmentDetails() {
  const [agents, setAgents] = useState([]);
  const { name } = useParams();

  useEffect(() => {
    API.get("/analytics/agent-performance").then((res) => {
      setAgents(res.data);
    });
  }, []);

  // 🔥 filter by department
  const filtered = agents.filter(
    (a) => (a.department || "No Department") === name,
  );

  const sorted = [...filtered].sort(
    (a, b) => a.avg_response_time - b.avg_response_time,
  );

  const formatTime = (sec) => {
    if (!sec) return "—";
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
    return `${Math.floor(sec / 3600)}h`;
  };

  // const getColor = (sec) => {
  //   if (!sec) return "#999";
  //   if (sec < 60) return "#22c55e";
  //   if (sec < 180) return "#f59e0b";
  //   return "#ef4444";
  // };

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>🏢 {name} - Agents</h2>

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead className={styles.thead}>
            <tr>
              <th className={styles.th}>#</th>
              <th className={styles.th}>Agent</th>
              <th className={styles.th}>Role</th>
              <th className={styles.th}>Country</th>
              <th className={styles.th}>Messages</th>
              <th className={styles.th}>Closed</th>
              <th className={styles.th}>Received</th>
              <th className={styles.th}>Avg Response</th>
              <th className={styles.th}>First Response</th>
            </tr>
          </thead>

          <tbody>
            {sorted.map((u, i) => {
              const isTop = i === 0;

              return (
                <tr
                  key={u.id}
                  className={`${styles.tr} ${isTop ? styles.topAgent : ""}`}
                >
                  <td className={`${styles.td} ${styles.rank}`}>#{i + 1}</td>

                  <td className={`${styles.td} ${styles.nameCell}`}>
                    {u.name}
                    <div className={styles.subText}>{u.role}</div>
                  </td>

                  <td className={styles.td}>{u.role}</td>

                  <td className={styles.td}>{u.country || "—"}</td>

                  <td className={styles.td}>{u.message_count || 0}</td>

                  <td className={styles.td}>{u.conversations_closed || 0}</td>
                  <td className={styles.td}>{u.messages_received || 0}</td>

                  <td className={styles.td}>
                    <span
                      className={
                        u.avg_response_time < 60
                          ? styles.green
                          : u.avg_response_time < 180
                            ? styles.orange
                            : styles.red
                      }
                    >
                      {formatTime(u.avg_response_time)}
                    </span>
                  </td>

                  <td className={styles.td}>
                    <span
                      className={
                        u.first_response_time < 60
                          ? styles.green
                          : u.first_response_time < 180
                            ? styles.orange
                            : styles.red
                      }
                    >
                      {formatTime(u.first_response_time)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
