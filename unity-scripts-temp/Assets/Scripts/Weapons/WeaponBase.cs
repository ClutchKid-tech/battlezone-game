using System;
using UnityEngine;

namespace BattleZone.Weapons
{
    public class WeaponBase : MonoBehaviour
    {
        [SerializeField] private WeaponStats stats;
        [SerializeField] private Transform   muzzlePoint;
        [SerializeField] private AudioSource audioSource;

        public WeaponStats Stats     => stats;
        public string      WeaponId  => stats ? stats.weaponId : string.Empty;
        public int         Ammo      { get; private set; }
        public int         Reserve   { get; private set; }
        public bool        IsReloading { get; private set; }

        public event Action<int, int>  OnAmmoChanged;   // current, reserve
        public event Action            OnFired;
        public event Action            OnReloadStart;
        public event Action            OnReloadEnd;

        private float _nextFireTime;
        private float _fireInterval;
        private bool  _isADS;

        private void Awake()
        {
            if (stats == null) return;
            Ammo    = stats.magazineSize;
            Reserve = stats.reserveAmmo;
            _fireInterval = 60f / stats.fireRate;
        }

        public bool CanFire()
        {
            return !IsReloading
                && Ammo > 0
                && Time.time >= _nextFireTime;
        }

        public void Fire()
        {
            if (!CanFire()) return;
            if (stats == null) return;

            Ammo--;
            _nextFireTime = Time.time + _fireInterval;

            // Muzzle flash
            if (stats.muzzleFlashPrefab != null && muzzlePoint != null)
                Instantiate(stats.muzzleFlashPrefab, muzzlePoint.position, muzzlePoint.rotation);

            // Audio
            if (audioSource != null && stats.fireSound != null)
                audioSource.PlayOneShot(stats.fireSound);

            OnAmmoChanged?.Invoke(Ammo, Reserve);
            OnFired?.Invoke();

            if (Ammo == 0 && Reserve > 0)
                Reload();
        }

        public void Reload()
        {
            if (IsReloading) return;
            if (Ammo >= stats.magazineSize) return;
            if (Reserve <= 0) return;

            IsReloading = true;
            OnReloadStart?.Invoke();

            if (audioSource != null && stats.reloadSound != null)
                audioSource.PlayOneShot(stats.reloadSound);

            Invoke(nameof(FinishReload), stats.reloadTime);
        }

        public void SetADS(bool ads)
        {
            _isADS = ads;
        }

        public float GetCurrentSpread()
        {
            float spread = stats.bulletSpread;
            if (_isADS) spread *= stats.adsSpreadMult;
            return spread;
        }

        public void AddAmmo(int amount)
        {
            Reserve = Mathf.Min(Reserve + amount, stats.reserveAmmo * 2);
            OnAmmoChanged?.Invoke(Ammo, Reserve);
        }

        private void FinishReload()
        {
            int needed  = stats.magazineSize - Ammo;
            int take    = Mathf.Min(needed, Reserve);
            Ammo       += take;
            Reserve    -= take;
            IsReloading = false;
            OnAmmoChanged?.Invoke(Ammo, Reserve);
            OnReloadEnd?.Invoke();
        }
    }
}
