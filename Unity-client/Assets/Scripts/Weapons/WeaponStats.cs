using UnityEngine;

namespace BattleZone.Weapons
{
    public enum WeaponClass { AssaultRifle, SMG, Sniper, Shotgun, Pistol, LMG }
    public enum FireMode    { Auto, SemiAuto, Burst }

    [CreateAssetMenu(fileName = "WeaponStats", menuName = "BattleZone/Weapon Stats")]
    public class WeaponStats : ScriptableObject
    {
        [Header("Identity")]
        public string     weaponId;
        public string     displayName;
        public WeaponClass weaponClass;
        public Sprite     icon;

        [Header("Firing")]
        public FireMode fireMode      = FireMode.Auto;
        public float    fireRate      = 600f;   // rounds per minute
        public float    damage        = 25f;
        public float    headshotMult  = 2f;
        public float    range         = 200f;
        public float    bulletSpread  = 0.5f;   // degrees
        public int      bulletsPerShot = 1;      // >1 for shotguns

        [Header("Ammo")]
        public int  magazineSize  = 30;
        public int  reserveAmmo   = 90;
        public float reloadTime   = 2.2f;

        [Header("ADS")]
        public float adsZoom        = 1.5f;
        public float adsMoveSpeed   = 0.75f;   // multiplier on walk speed
        public float adsSpreadMult  = 0.4f;    // tighter spread while ADS

        [Header("Recoil")]
        public float recoilUp    = 1.5f;
        public float recoilSide  = 0.5f;
        public float recoilRecovery = 6f;      // recovery speed (deg/sec)

        [Header("Audio / VFX")]
        public AudioClip fireSound;
        public AudioClip reloadSound;
        public AudioClip dryFireSound;
        public GameObject muzzleFlashPrefab;
        public GameObject bulletImpactPrefab;
    }
}
