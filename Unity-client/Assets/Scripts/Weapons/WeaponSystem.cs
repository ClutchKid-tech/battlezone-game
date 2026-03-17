using System.Collections.Generic;
using UnityEngine;

namespace BattleZone.Weapons
{
    /// <summary>
    /// Manages up to 3 weapon slots for the local player.
    /// </summary>
    public class WeaponSystem : MonoBehaviour
    {
        [SerializeField] private Transform weaponHolder;
        [SerializeField] private List<WeaponBase> startingWeapons;

        private readonly WeaponBase[] _slots = new WeaponBase[3];
        private int _currentSlot = 0;
        private bool _isADS;

        public WeaponBase CurrentWeapon => _slots[_currentSlot];
        public string CurrentWeaponId  => CurrentWeapon?.WeaponId ?? string.Empty;

        private void Start()
        {
            // Equip starting weapons
            for (int i = 0; i < startingWeapons.Count && i < 3; i++)
            {
                if (startingWeapons[i] != null)
                    _slots[i] = startingWeapons[i];
            }
            ActivateSlot(_currentSlot);
        }

        public void SelectSlot(int slot)
        {
            if (slot < 0 || slot >= 3) return;
            if (_slots[slot] == null) return;
            _currentSlot = slot;
            ActivateSlot(_currentSlot);
        }

        public void NextWeapon()
        {
            int next = (_currentSlot + 1) % 3;
            for (int i = 0; i < 3; i++)
            {
                if (_slots[next] != null) { SelectSlot(next); return; }
                next = (next + 1) % 3;
            }
        }

        public void PreviousWeapon()
        {
            int prev = (_currentSlot + 2) % 3;
            for (int i = 0; i < 3; i++)
            {
                if (_slots[prev] != null) { SelectSlot(prev); return; }
                prev = (prev + 2) % 3;
            }
        }

        public bool PickupWeapon(WeaponBase weapon, int slot = -1)
        {
            int targetSlot = slot >= 0 ? slot : FindFreeSlot();
            if (targetSlot == -1) return false;

            if (_slots[targetSlot] != null)
                DropWeapon(targetSlot);

            _slots[targetSlot] = weapon;
            weapon.transform.SetParent(weaponHolder, false);
            weapon.gameObject.SetActive(targetSlot == _currentSlot);
            return true;
        }

        public void DropWeapon(int slot)
        {
            if (_slots[slot] == null) return;
            _slots[slot].transform.SetParent(null);
            // In a full game: spawn a loot pickup in the world
            _slots[slot] = null;
        }

        public void Reload() => CurrentWeapon?.Reload();

        public void SetADS(bool ads)
        {
            _isADS = ads;
            CurrentWeapon?.SetADS(ads);
        }

        private void ActivateSlot(int slot)
        {
            for (int i = 0; i < 3; i++)
            {
                if (_slots[i] != null)
                    _slots[i].gameObject.SetActive(i == slot);
            }
        }

        private int FindFreeSlot()
        {
            for (int i = 0; i < 3; i++)
                if (_slots[i] == null) return i;
            return -1;
        }
    }
}
