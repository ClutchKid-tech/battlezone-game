using UnityEngine;
using BattleZone.Network;

namespace BattleZone.Player
{
    /// <summary>
    /// Attached to every remote player GameObject.
    /// Receives deserialized state from GameSocketManager and hands it to
    /// RemotePlayerInterpolator.
    /// </summary>
    public class RemotePlayer : MonoBehaviour
    {
        public string PlayerId   { get; private set; }
        public string PlayerName { get; private set; }
        public bool   IsAlive    { get; private set; } = true;

        [SerializeField] private GameObject        deathEffect;
        [SerializeField] private SkinnedMeshRenderer bodyRenderer;

        private RemotePlayerInterpolator _interp;

        private void Awake()
        {
            _interp = GetComponent<RemotePlayerInterpolator>();
        }

        public void Init(string playerId, string playerName, Vector3 initialPos)
        {
            PlayerId   = playerId;
            PlayerName = playerName;
            transform.position = initialPos;
            _interp?.Init(initialPos);
        }

        public void ApplyState(PlayerStateMsg msg)
        {
            if (!IsAlive) return;

            var targetPos = new Vector3(msg.x, msg.y, msg.z);
            var targetRot = Quaternion.Euler(0f, msg.rotY, 0f);

            _interp?.Enqueue(targetPos, targetRot);

            if (msg.hp <= 0f && IsAlive)
                Kill();
        }

        public void Kill()
        {
            IsAlive = false;

            if (deathEffect != null)
                Instantiate(deathEffect, transform.position, Quaternion.identity);

            if (bodyRenderer != null)
                bodyRenderer.enabled = false;

            // Destroy after brief delay so death effect can play
            Destroy(gameObject, 3f);
        }
    }
}
