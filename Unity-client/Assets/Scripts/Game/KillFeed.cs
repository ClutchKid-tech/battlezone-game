using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using TMPro;

namespace BattleZone.Game
{
    public class KillFeed : MonoBehaviour
    {
        [SerializeField] private Transform  feedContainer;
        [SerializeField] private GameObject entryPrefab;
        [SerializeField] private int        maxEntries  = 6;
        [SerializeField] private float      entryLifetime = 5f;

        private readonly Queue<GameObject> _entries = new();

        public void AddEntry(string killerId, string victimId, string weaponId)
        {
            string killerLabel = killerId == BattleZone.Utils.TokenStorage.UserId ? "YOU" : killerId;
            string victimLabel = victimId == BattleZone.Utils.TokenStorage.UserId ? "YOU" : victimId;

            string text = $"{killerLabel}  [{weaponId}]  {victimLabel}";

            var go   = Instantiate(entryPrefab, feedContainer);
            var tmp  = go.GetComponentInChildren<TMP_Text>();
            if (tmp != null)
            {
                tmp.text  = text;
                tmp.color = victimId == BattleZone.Utils.TokenStorage.UserId
                    ? new Color(1f, 0.42f, 0.1f)   // orange – you died
                    : killerId == BattleZone.Utils.TokenStorage.UserId
                        ? new Color(0.18f, 0.8f, 0.44f)  // green – you killed
                        : Color.white;
            }

            _entries.Enqueue(go);

            while (_entries.Count > maxEntries)
                Destroy(_entries.Dequeue());

            StartCoroutine(FadeOut(go, entryLifetime));
        }

        private IEnumerator FadeOut(GameObject entry, float delay)
        {
            yield return new WaitForSeconds(delay - 0.5f);

            float elapsed = 0f;
            var tmp = entry.GetComponentInChildren<TMP_Text>();
            Color startColor = tmp != null ? tmp.color : Color.white;

            while (elapsed < 0.5f)
            {
                elapsed += Time.deltaTime;
                float a = 1f - elapsed / 0.5f;
                if (tmp != null) tmp.color = new Color(startColor.r, startColor.g, startColor.b, a);
                yield return null;
            }

            if (entry != null) Destroy(entry);
        }
    }
}
