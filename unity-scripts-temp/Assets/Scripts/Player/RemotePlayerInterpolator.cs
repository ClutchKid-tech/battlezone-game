using System.Collections.Generic;
using UnityEngine;

namespace BattleZone.Player
{
    /// <summary>
    /// Smooth entity interpolation using a small state buffer.
    /// Keeps the render position ~100 ms behind the latest received snapshot
    /// to hide network jitter.
    /// </summary>
    public class RemotePlayerInterpolator : MonoBehaviour
    {
        [SerializeField] private float interpolationDelay = 0.1f; // 100 ms buffer

        private struct Snapshot
        {
            public double    Time;
            public Vector3   Position;
            public Quaternion Rotation;
        }

        private readonly List<Snapshot> _buffer = new();

        public void Init(Vector3 startPos)
        {
            _buffer.Clear();
            _buffer.Add(new Snapshot
            {
                Time     = NetworkTime(),
                Position = startPos,
                Rotation = transform.rotation
            });
        }

        public void Enqueue(Vector3 position, Quaternion rotation)
        {
            _buffer.Add(new Snapshot
            {
                Time     = NetworkTime(),
                Position = position,
                Rotation = rotation
            });

            // Prune old snapshots (keep only last 20)
            while (_buffer.Count > 20)
                _buffer.RemoveAt(0);
        }

        private void Update()
        {
            if (_buffer.Count < 2) return;

            double renderTime = NetworkTime() - interpolationDelay;

            // Find two surrounding snapshots
            int i = _buffer.Count - 1;
            while (i > 0 && _buffer[i - 1].Time > renderTime) i--;

            if (i == 0)
            {
                transform.SetPositionAndRotation(_buffer[0].Position, _buffer[0].Rotation);
                return;
            }

            var from = _buffer[i - 1];
            var to   = _buffer[i];

            double span = to.Time - from.Time;
            float  t    = span > 0.0001 ? (float)((renderTime - from.Time) / span) : 1f;
            t = Mathf.Clamp01(t);

            transform.SetPositionAndRotation(
                Vector3.Lerp(from.Position, to.Position, t),
                Quaternion.Slerp(from.Rotation, to.Rotation, t)
            );
        }

        // Use Time.timeAsDouble as a stand-in for network time.
        // In production replace with NTP-synced time from the server.
        private static double NetworkTime() => Time.timeAsDouble;
    }
}
