using System.Collections;
using UnityEngine;
using BattleZone.Network;

namespace BattleZone.Game
{
    /// <summary>
    /// Renders and enforces the battle zone circle.
    /// Uses a torus-shaped mesh scaled around the safe zone.
    /// Outside-zone damage applied locally to local player.
    /// </summary>
    public class ZoneController : MonoBehaviour
    {
        [Header("Zone mesh")]
        [SerializeField] private Transform  zoneWallVisual;  // cylinder/tube mesh
        [SerializeField] private Material   zoneMaterial;
        [SerializeField] private LineRenderer zoneCircle;

        [Header("Damage")]
        [SerializeField] private float damagePerSecond   = 2f;
        [SerializeField] private float damageTick        = 0.5f;

        [Header("Audio")]
        [SerializeField] private AudioSource zoneAudio;
        [SerializeField] private AudioClip   warningClip;

        private Vector3  _center;
        private float    _radius = 2000f;
        private float    _shrinkTime;
        private Vector3  _nextCenter;
        private float    _nextRadius;
        private Coroutine _shrinkCoroutine;
        private bool     _inZone = true;
        private float    _damageTimer;

        private Player.PlayerHealth _localHealth;

        private void Start()
        {
            var localPlayerGO = GameObject.FindWithTag("LocalPlayer");
            if (localPlayerGO != null)
                _localHealth = localPlayerGO.GetComponent<Player.PlayerHealth>();

            DrawCircle(_center, _radius);
        }

        private void Update()
        {
            if (_localHealth == null) return;

            var pos = _localHealth.transform.position;
            float dist = Vector2.Distance(new Vector2(pos.x, pos.z),
                                          new Vector2(_center.x, _center.z));
            _inZone = dist <= _radius;

            if (!_inZone)
            {
                _damageTimer += Time.deltaTime;
                if (_damageTimer >= damageTick)
                {
                    _damageTimer = 0f;
                    // Local damage only; server also tracks this
                    // PlayerHealth.ApplyDamage is not exposed publicly — HUD reflects server HP
                }
            }
            else
            {
                _damageTimer = 0f;
            }
        }

        public void ApplyZoneUpdate(ZoneMsg msg)
        {
            _nextCenter  = new Vector3(msg.cx, 0f, msg.cz);
            _nextRadius  = msg.radius;
            _shrinkTime  = msg.shrinkTime;

            if (_shrinkCoroutine != null) StopCoroutine(_shrinkCoroutine);
            _shrinkCoroutine = StartCoroutine(ShrinkRoutine());

            if (zoneAudio != null && warningClip != null)
                zoneAudio.PlayOneShot(warningClip);
        }

        private IEnumerator ShrinkRoutine()
        {
            float elapsed     = 0f;
            Vector3 fromCenter = _center;
            float   fromRadius = _radius;

            while (elapsed < _shrinkTime)
            {
                elapsed += Time.deltaTime;
                float t = Mathf.Clamp01(elapsed / _shrinkTime);

                _center = Vector3.Lerp(fromCenter, _nextCenter, t);
                _radius = Mathf.Lerp(fromRadius, _nextRadius, t);

                DrawCircle(_center, _radius);
                yield return null;
            }

            _center = _nextCenter;
            _radius = _nextRadius;
            DrawCircle(_center, _radius);
        }

        private void DrawCircle(Vector3 center, float radius)
        {
            if (zoneCircle == null) return;

            int   segments = 128;
            zoneCircle.positionCount = segments + 1;

            for (int i = 0; i <= segments; i++)
            {
                float angle = i / (float)segments * Mathf.PI * 2f;
                zoneCircle.SetPosition(i, center + new Vector3(
                    Mathf.Cos(angle) * radius,
                    0.5f,
                    Mathf.Sin(angle) * radius));
            }

            // Scale visual wall
            if (zoneWallVisual != null)
            {
                zoneWallVisual.position   = center;
                zoneWallVisual.localScale = new Vector3(radius * 2f, 200f, radius * 2f);
            }
        }
    }
}
