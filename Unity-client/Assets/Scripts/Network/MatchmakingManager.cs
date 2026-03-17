using System;
using UnityEngine;
using Newtonsoft.Json.Linq;
using BattleZone.Utils;

namespace BattleZone.Network
{
    [Serializable]
    public class MatchFoundData
    {
        public string matchId;
        public string region;
        public int    playerCount;
    }

    public class MatchmakingManager : MonoBehaviour
    {
        public static MatchmakingManager Instance { get; private set; }

        public event Action              OnQueued;
        public event Action<MatchFoundData> OnMatchFound;
        public event Action<MatchFoundData> OnMatchReady;
        public event Action              OnLeft;
        public event Action<string>      OnError;
        public event Action              OnRequeued;

        public bool InQueue { get; private set; }

        private NetworkManager _net;

        private void Awake()
        {
            if (Instance != null && Instance != this) { Destroy(gameObject); return; }
            Instance = this;
            DontDestroyOnLoad(gameObject);
        }

        private void Start()
        {
            _net = NetworkManager.Instance;
        }

        private void OnDestroy()
        {
            UnbindEvents();
        }

        // ── Public API ──────────────────────────────────────────────────────────

        public void Connect()
        {
            _net.ConnectMatchmaking(TokenStorage.AccessToken);
            BindEvents();
        }

        public void JoinQueue(string mode = "solo", string region = "us-east")
        {
            if (_net.MatchmakingSocket == null)
            {
                Debug.LogWarning("[Matchmaking] Socket not connected.");
                return;
            }
            _net.MatchmakingSocket.Emit("mm:join", new { mode, region });
            Debug.Log($"[Matchmaking] Emitted mm:join mode={mode} region={region}");
        }

        public void LeaveQueue()
        {
            _net.MatchmakingSocket?.Emit("mm:leave");
            InQueue = false;
        }

        // ── Private ─────────────────────────────────────────────────────────────

        private void BindEvents()
        {
            var sock = _net.MatchmakingSocket;
            if (sock == null) return;

            sock.On("mm:queued",      _ => _net.RunOnMainThread(HandleQueued));
            sock.On("mm:found",       d => _net.RunOnMainThread(() => HandleFound(d.GetValue<MatchFoundData>())));
            sock.On("mm:match_ready", d => _net.RunOnMainThread(() => HandleReady(d.GetValue<MatchFoundData>())));
            sock.On("mm:left",        _ => _net.RunOnMainThread(HandleLeft));
            sock.On("mm:error",       d => _net.RunOnMainThread(() => HandleError(d.GetValue<string>())));
            sock.On("mm:requeued",    _ => _net.RunOnMainThread(HandleRequeued));
        }

        private void UnbindEvents()
        {
            // SocketIOUnity cleans up on Disconnect; explicit off not needed
        }

        private void HandleQueued()
        {
            InQueue = true;
            Debug.Log("[Matchmaking] In queue.");
            OnQueued?.Invoke();
        }

        private void HandleFound(MatchFoundData data)
        {
            Debug.Log($"[Matchmaking] Match found: {data?.matchId}");
            OnMatchFound?.Invoke(data);
        }

        private void HandleReady(MatchFoundData data)
        {
            InQueue = false;
            Debug.Log($"[Matchmaking] Match ready: {data?.matchId}");
            OnMatchReady?.Invoke(data);
        }

        private void HandleLeft()
        {
            InQueue = false;
            Debug.Log("[Matchmaking] Left queue.");
            OnLeft?.Invoke();
        }

        private void HandleError(string msg)
        {
            Debug.LogWarning($"[Matchmaking] Error: {msg}");
            OnError?.Invoke(msg);
        }

        private void HandleRequeued()
        {
            Debug.Log("[Matchmaking] Requeued.");
            OnRequeued?.Invoke();
        }
    }
}
