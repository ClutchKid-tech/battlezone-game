using System;
using UnityEngine;
using BattleZone.Network;

namespace BattleZone.Player
{
    public class PlayerHealth : MonoBehaviour
    {
        [SerializeField] private float maxHp     = 100f;
        [SerializeField] private float maxArmor  = 100f;

        public float Hp    { get; private set; }
        public float Armor { get; private set; }

        public event Action<float, float> OnHealthChanged; // hp, armor
        public event Action<string>       OnDied;          // killer id

        private bool             _dead;
        private PlayerController _controller;
        private GameSocketManager _gameSocket;

        private void Awake()
        {
            _controller = GetComponent<PlayerController>();
            Hp    = maxHp;
            Armor = 0f;
        }

        private void Start()
        {
            _gameSocket = GameSocketManager.Instance;
            _gameSocket.OnHit  += HandleHit;
        }

        private void OnDestroy()
        {
            if (_gameSocket != null) _gameSocket.OnHit -= HandleHit;
        }

        public void AddArmor(float amount)
        {
            Armor = Mathf.Min(Armor + amount, maxArmor);
            OnHealthChanged?.Invoke(Hp, Armor);
        }

        public void Heal(float amount)
        {
            Hp = Mathf.Min(Hp + amount, maxHp);
            OnHealthChanged?.Invoke(Hp, Armor);
        }

        // Called by server hit events addressed to local player
        private void HandleHit(HitMsg msg)
        {
            // Only process hits where WE are the target
            if (msg.targetId != BattleZone.Utils.TokenStorage.UserId) return;
            if (_dead) return;

            float remaining = msg.damage;

            if (Armor > 0f)
            {
                float absorbed = Mathf.Min(Armor, remaining * 0.5f);
                Armor    -= absorbed;
                remaining -= absorbed;
            }

            Hp = Mathf.Max(0f, Hp - remaining);
            OnHealthChanged?.Invoke(Hp, Armor);

            if (Hp <= 0f) Die(msg.shooterId);
        }

        private void Die(string killerId)
        {
            if (_dead) return;
            _dead = true;
            _controller?.SetAlive(false);
            _gameSocket?.SendDied(killerId);
            OnDied?.Invoke(killerId);
        }
    }
}
