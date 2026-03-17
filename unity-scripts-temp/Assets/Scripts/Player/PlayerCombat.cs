using UnityEngine;
using BattleZone.Network;
using BattleZone.Weapons;

namespace BattleZone.Player
{
    public class PlayerCombat : MonoBehaviour
    {
        [SerializeField] private Transform   cameraRig;
        [SerializeField] private LayerMask   hitLayers;
        [SerializeField] private float       maxRange = 300f;

        private WeaponSystem      _weaponSystem;
        private GameSocketManager _gameSocket;
        private bool              _alive = true;

        private void Start()
        {
            _weaponSystem = GetComponent<WeaponSystem>();
            _gameSocket   = GameSocketManager.Instance;

            GetComponent<PlayerHealth>().OnDied += _ => _alive = false;
        }

        private void Update()
        {
            if (!_alive || _weaponSystem == null) return;

            if (Input.GetMouseButton(0))
                TryShoot();

            if (Input.GetMouseButtonDown(1))
                _weaponSystem.SetADS(true);

            if (Input.GetMouseButtonUp(1))
                _weaponSystem.SetADS(false);

            if (Input.GetKeyDown(KeyCode.R))
                _weaponSystem.Reload();

            // Weapon scroll
            float scroll = Input.GetAxisRaw("Mouse ScrollWheel");
            if (scroll > 0f) _weaponSystem.NextWeapon();
            if (scroll < 0f) _weaponSystem.PreviousWeapon();

            // Quick slots 1-3
            if (Input.GetKeyDown(KeyCode.Alpha1)) _weaponSystem.SelectSlot(0);
            if (Input.GetKeyDown(KeyCode.Alpha2)) _weaponSystem.SelectSlot(1);
            if (Input.GetKeyDown(KeyCode.Alpha3)) _weaponSystem.SelectSlot(2);
        }

        private void TryShoot()
        {
            if (_weaponSystem.CurrentWeapon == null) return;
            if (!_weaponSystem.CurrentWeapon.CanFire())  return;

            _weaponSystem.CurrentWeapon.Fire();

            var origin = cameraRig.position;
            var dir    = cameraRig.forward;

            // Tell server about the shot
            _gameSocket?.SendShoot(origin.x, origin.y, origin.z,
                                   dir.x,    dir.y,    dir.z);

            // Local raycast for immediate VFX/sound feedback
            if (Physics.Raycast(origin, dir, out RaycastHit hit, maxRange, hitLayers))
            {
                // Spawn bullet hole / blood depending on layer (handled by VFX system)
                Debug.DrawLine(origin, hit.point, Color.red, 0.1f);
            }
        }
    }
}
