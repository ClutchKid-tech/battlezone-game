using System.Collections.Generic;
using UnityEngine;
using BattleZone.Network;

namespace BattleZone.Game
{
    public class LootManager : MonoBehaviour
    {
        [Header("Prefabs")]
        [SerializeField] private GameObject weaponLootPrefab;
        [SerializeField] private GameObject ammoLootPrefab;
        [SerializeField] private GameObject armorLootPrefab;
        [SerializeField] private GameObject healLootPrefab;

        private readonly Dictionary<string, GameObject> _lootObjects = new();

        public void SpawnLoot(LootMsg msg)
        {
            if (_lootObjects.ContainsKey(msg.lootId)) return;

            var prefab = SelectPrefab(msg.itemType);
            if (prefab == null) return;

            var pos = new Vector3(msg.x, msg.y, msg.z);
            var go  = Instantiate(prefab, pos, Quaternion.identity);

            // Tag with loot id for pickup trigger
            var trigger = go.AddComponent<LootTrigger>();
            trigger.Init(msg.lootId, msg.itemType, msg.itemId, msg.amount);

            _lootObjects[msg.lootId] = go;
        }

        public void RemoveLoot(string lootId)
        {
            if (_lootObjects.TryGetValue(lootId, out var go))
            {
                Destroy(go);
                _lootObjects.Remove(lootId);
            }
        }

        private GameObject SelectPrefab(string itemType) => itemType switch
        {
            "weapon" => weaponLootPrefab,
            "ammo"   => ammoLootPrefab,
            "armor"  => armorLootPrefab,
            "heal"   => healLootPrefab,
            _        => null
        };
    }

    /// <summary>Attached dynamically to spawned loot GameObjects.</summary>
    public class LootTrigger : MonoBehaviour
    {
        public string LootId   { get; private set; }
        public string ItemType { get; private set; }
        public string ItemId   { get; private set; }
        public int    Amount   { get; private set; }

        private bool _pickedUp;

        public void Init(string lootId, string itemType, string itemId, int amount)
        {
            LootId   = lootId;
            ItemType = itemType;
            ItemId   = itemId;
            Amount   = amount;
        }

        private void OnTriggerEnter(Collider other)
        {
            if (_pickedUp) return;
            if (!other.CompareTag("LocalPlayer")) return;

            _pickedUp = true;
            GameSocketManager.Instance?.SendPickup(LootId);
            // Actual inventory/health modification happens on server confirmation
        }
    }
}
