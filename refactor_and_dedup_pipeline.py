import sqlite3
import json
import urllib.request
import hashlib
import time
import math
import random
import os
import sys

DB_PATH = '/home/hardstone/CodeSpace/GitHub/brian-agent/brian-backend/data/brian.db'
EMBED_URL = 'http://127.0.0.1:8080/v1/embeddings'
MODEL_NAME = 'nomic-embed-text-v1.5.Q4_K_M.gguf'

from refactor_rules import make_agent_brief, make_prompt_brief, make_soul_brief, make_skill_brief, make_mcp_brief

def compute_hash(text):
    return hashlib.sha256(text.strip().encode('utf-8')).hexdigest()

def get_embeddings_batch(texts, batch_size=16):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    all_embeddings = []
    
    for i in range(0, len(texts), batch_size):
        chunk = texts[i:i + batch_size]
        payload = json.dumps({
            "input": chunk,
            "model": MODEL_NAME
        }).encode('utf-8')
        
        req = urllib.request.Request(
            EMBED_URL,
            data=payload,
            headers={'Content-Type': 'application/json'}
        )
        try:
            resp = opener.open(req)
            data = json.loads(resp.read().decode('utf-8'))
            for item in data['data']:
                all_embeddings.append(item['embedding'])
        except Exception as e:
            print(f"Error fetching embeddings for chunk {i}: {e}")
            raise e
            
    return all_embeddings

def cosine_similarity(v1, v2):
    dot = sum(a * b for a, b in zip(v1, v2))
    norm1 = math.sqrt(sum(a * a for a in v1))
    norm2 = math.sqrt(sum(b * b for b in v2))
    if norm1 == 0 or norm2 == 0:
        return 0.0
    return dot / (norm1 * norm2)

def kmeans_clustering(vectors, k, max_iters=50, seed=42):
    random.seed(seed)
    n = len(vectors)
    if n <= k:
        return {i: [i] for i in range(n)}
    
    dim = len(vectors[0])
    # K-means++ initialization
    centroids = [vectors[random.randint(0, n - 1)]]
    for _ in range(1, k):
        dist_sq = []
        for v in vectors:
            min_d = min(1.0 - cosine_similarity(v, c) for c in centroids)
            dist_sq.append(max(min_d, 0.0) ** 2)
        total_d = sum(dist_sq)
        if total_d == 0:
            centroids.append(vectors[random.randint(0, n - 1)])
            continue
        r = random.uniform(0, total_d)
        cur = 0
        for i, d in enumerate(dist_sq):
            cur += d
            if cur >= r:
                centroids.append(vectors[i])
                break
        if len(centroids) <= _:
            centroids.append(vectors[random.randint(0, n - 1)])
            
    assignments = [0] * n
    for iteration in range(max_iters):
        # Assign to closest centroid
        new_assignments = []
        for v in vectors:
            best_sim = -1.0
            best_c = 0
            for c_idx, c in enumerate(centroids):
                sim = cosine_similarity(v, c)
                if sim > best_sim:
                    best_sim = sim
                    best_c = c_idx
            new_assignments.append(best_c)
            
        if new_assignments == assignments and iteration > 0:
            break
        assignments = new_assignments
        
        # Recompute centroids
        for c_idx in range(k):
            members = [vectors[i] for i in range(n) if assignments[i] == c_idx]
            if members:
                new_c = [0.0] * dim
                for m in members:
                    for d in range(dim):
                        new_c[d] += m[d]
                norm = math.sqrt(sum(x * x for x in new_c))
                if norm > 0:
                    centroids[c_idx] = [x / norm for x in new_c]
                    
    clusters = {c_idx: [] for c_idx in range(k)}
    for i, c_idx in enumerate(assignments):
        clusters[c_idx].append(i)
    return clusters

def run_pipeline():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    now_ts = int(time.time() * 1000)

    print("=" * 80)
    print("STARTING BRIAN COMPONENT REFACTORING, EMBEDDING & DEDUPLICATION PIPELINE")
    print("=" * 80)

    # 1. RUNTIME AGENT DEF RECORDS
    cur.execute('SELECT * FROM runtime_agent_def_record')
    runtime_agents = [dict(r) for r in cur.fetchall()]
    print(f"\n[Step 1/6] Processing {len(runtime_agents)} Runtime Agent Def records...")
    agent_texts = []
    for a in runtime_agents:
        brief = make_agent_brief(a)
        assert 20 <= len(brief) <= 40, f"Invalid agent brief [{len(brief)}]: {brief}"
        a['new_brief'] = brief
        agent_texts.append(brief)
        cur.execute('UPDATE runtime_agent_def_record SET brief = ?, updated = ? WHERE id = ?', (brief, now_ts, a['id']))

    runtime_agent_vecs = get_embeddings_batch(agent_texts)
    for a, vec in zip(runtime_agents, runtime_agent_vecs):
        a['vector'] = vec
        c_hash = compute_hash(a['new_brief'])
        vec_json = json.dumps(vec)
        cur.execute('''
            INSERT INTO agent_embedding_record (id, created, updated, agent_id, model, dimension, content_hash, content, embedding, trace_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '')
            ON CONFLICT(agent_id) DO UPDATE SET
                updated = excluded.updated,
                model = excluded.model,
                dimension = excluded.dimension,
                content_hash = excluded.content_hash,
                content = excluded.content,
                embedding = excluded.embedding
        ''', (f"emb-agent-rt-{a['id']}", now_ts, now_ts, a['id'], MODEL_NAME, len(vec), c_hash, a['new_brief'], vec_json))

    conn.commit()
    print(f"✓ {len(runtime_agents)} Runtime Agents updated and embedded.")

    # 2. AGENT RECORDS (Agent Library)
    cur.execute('SELECT * FROM agent_record')
    lib_agents = [dict(r) for r in cur.fetchall()]
    print(f"\n[Step 2/6] Processing {len(lib_agents)} Agent Library records...")
    lib_agent_texts = []
    for a in lib_agents:
        brief = make_agent_brief(a)
        assert 20 <= len(brief) <= 40, f"Invalid agent brief [{len(brief)}]: {brief}"
        a['new_brief'] = brief
        lib_agent_texts.append(brief)
        cur.execute('UPDATE agent_record SET brief = ?, updated = ? WHERE id = ?', (brief, now_ts, a['id']))

    lib_agent_vecs = get_embeddings_batch(lib_agent_texts)
    for a, vec in zip(lib_agents, lib_agent_vecs):
        a['vector'] = vec
        c_hash = compute_hash(a['new_brief'])
        vec_json = json.dumps(vec)
        cur.execute('''
            INSERT INTO agent_embedding_record (id, created, updated, agent_id, model, dimension, content_hash, content, embedding, trace_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '')
            ON CONFLICT(agent_id) DO UPDATE SET
                updated = excluded.updated,
                model = excluded.model,
                dimension = excluded.dimension,
                content_hash = excluded.content_hash,
                content = excluded.content,
                embedding = excluded.embedding
        ''', (f"emb-agent-lib-{a['id']}", now_ts, now_ts, a['id'], MODEL_NAME, len(vec), c_hash, a['new_brief'], vec_json))

    conn.commit()
    print(f"✓ {len(lib_agents)} Agent Library records updated and embedded.")

    # 3. PROMPT TEMPLATE RECORDS
    cur.execute('SELECT * FROM prompt_template_record')
    prompts = [dict(r) for r in cur.fetchall()]
    print(f"\n[Step 3/6] Processing {len(prompts)} Prompt Template records...")
    prompt_texts = []
    for p in prompts:
        brief = make_prompt_brief(p)
        assert 20 <= len(brief) <= 40, f"Invalid prompt brief [{len(brief)}]: {brief}"
        p['new_brief'] = brief
        prompt_texts.append(brief)
        cur.execute('UPDATE prompt_template_record SET brief = ?, updated = ? WHERE id = ?', (brief, now_ts, p['id']))

    prompt_vecs = get_embeddings_batch(prompt_texts)
    for p, vec in zip(prompts, prompt_vecs):
        p['vector'] = vec
        c_hash = compute_hash(p['new_brief'])
        vec_json = json.dumps(vec)
        cur.execute('''
            INSERT INTO prompt_template_embedding_record (id, created, updated, prompt_template_id, model, dimension, content_hash, content, embedding, trace_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '')
            ON CONFLICT(prompt_template_id) DO UPDATE SET
                updated = excluded.updated,
                model = excluded.model,
                dimension = excluded.dimension,
                content_hash = excluded.content_hash,
                content = excluded.content,
                embedding = excluded.embedding
        ''', (f"emb-prompt-{p['id']}", now_ts, now_ts, p['id'], MODEL_NAME, len(vec), c_hash, p['new_brief'], vec_json))

    conn.commit()
    print(f"✓ {len(prompts)} Prompt Templates updated and embedded.")

    # 4. SOUL RECORDS
    cur.execute('SELECT * FROM soul_record')
    souls = [dict(r) for r in cur.fetchall()]
    print(f"\n[Step 4/6] Processing {len(souls)} Soul records...")
    soul_texts = []
    for s in souls:
        brief = make_soul_brief(s)
        assert 20 <= len(brief) <= 40, f"Invalid soul brief [{len(brief)}]: {brief}"
        s['new_brief'] = brief
        soul_texts.append(brief)
        cur.execute('UPDATE soul_record SET brief = ?, updated = ? WHERE id = ?', (brief, now_ts, s['id']))

    soul_vecs = get_embeddings_batch(soul_texts)
    for s, vec in zip(souls, soul_vecs):
        s['vector'] = vec
        c_hash = compute_hash(s['new_brief'])
        vec_json = json.dumps(vec)
        cur.execute('''
            INSERT INTO soul_embedding_record (id, created, updated, soul_id, model, dimension, content_hash, content, embedding, trace_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '')
            ON CONFLICT(soul_id) DO UPDATE SET
                updated = excluded.updated,
                model = excluded.model,
                dimension = excluded.dimension,
                content_hash = excluded.content_hash,
                content = excluded.content,
                embedding = excluded.embedding
        ''', (f"emb-soul-{s['id']}", now_ts, now_ts, s['id'], MODEL_NAME, len(vec), c_hash, s['new_brief'], vec_json))

    conn.commit()
    print(f"✓ {len(souls)} Souls updated and embedded.")

    # 5. SKILL RECORDS
    cur.execute('SELECT * FROM skill_record')
    skills = [dict(r) for r in cur.fetchall()]
    print(f"\n[Step 5/6] Processing {len(skills)} Skill records...")
    skill_texts = []
    for sk in skills:
        brief = make_skill_brief(sk)
        assert 20 <= len(brief) <= 40, f"Invalid skill brief [{len(brief)}]: {brief}"
        sk['new_brief'] = brief
        skill_texts.append(brief)
        cur.execute('UPDATE skill_record SET brief = ?, updated = ? WHERE id = ?', (brief, now_ts, sk['id']))

    skill_vecs = get_embeddings_batch(skill_texts)
    for sk, vec in zip(skills, skill_vecs):
        sk['vector'] = vec
        c_hash = compute_hash(sk['new_brief'])
        vec_json = json.dumps(vec)
        cur.execute('''
            INSERT INTO skill_embedding_record (id, created, updated, skill_id, model, dimension, content_hash, content, embedding, trace_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '')
            ON CONFLICT(skill_id) DO UPDATE SET
                updated = excluded.updated,
                model = excluded.model,
                dimension = excluded.dimension,
                content_hash = excluded.content_hash,
                content = excluded.content,
                embedding = excluded.embedding
        ''', (f"emb-skill-{sk['id']}", now_ts, now_ts, sk['id'], MODEL_NAME, len(vec), c_hash, sk['new_brief'], vec_json))

    conn.commit()
    print(f"✓ {len(skills)} Skills updated and embedded.")

    # 6. MCP INSTALL & PROVIDER RECORDS
    cur.execute('SELECT * FROM mcp_install_record')
    mcps = [dict(r) for r in cur.fetchall()]
    print(f"\n[Step 6/6] Processing {len(mcps)} MCP records...")
    mcp_texts = []
    for m in mcps:
        brief = make_mcp_brief(m)
        assert 20 <= len(brief) <= 40, f"Invalid MCP brief [{len(brief)}]: {brief}"
        m['new_brief'] = brief
        mcp_texts.append(brief)
        cur.execute('UPDATE mcp_install_record SET mcp_brief = ?, updated = ? WHERE id = ?', (brief, now_ts, m['id']))
        if m.get('mcp_provider_id'):
            cur.execute('UPDATE mcp_provider_record SET mcp_provider_brief = ?, updated = ? WHERE id = ?', (brief, now_ts, m['mcp_provider_id']))

    mcp_vecs = get_embeddings_batch(mcp_texts)
    for m, vec in zip(mcps, mcp_vecs):
        m['vector'] = vec
        c_hash = compute_hash(m['new_brief'])
        vec_json = json.dumps(vec)
        cur.execute('''
            INSERT INTO mcp_embedding_record (id, created, updated, mcp_id, model, dimension, content_hash, content, embedding, trace_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '')
            ON CONFLICT(mcp_id) DO UPDATE SET
                updated = excluded.updated,
                model = excluded.model,
                dimension = excluded.dimension,
                content_hash = excluded.content_hash,
                content = excluded.content,
                embedding = excluded.embedding
        ''', (f"emb-mcp-{m['id']}", now_ts, now_ts, m['id'], MODEL_NAME, len(vec), c_hash, m['new_brief'], vec_json))

    conn.commit()
    print(f"✓ {len(mcps)} MCP records updated and embedded.")

    # =============================================================
    # CLUSTERING & DEDUPLICATION
    # =============================================================
    print("\n" + "=" * 80)
    print("K-MEANS CLUSTERING & DEDUPLICATION EXECUTION")
    print("=" * 80)

    dedup_results = {}

    def run_cluster_dedup(category_name, items, vectors, k, name_field, id_field, table_name, status_col='status', disabled_val='disabled', sim_threshold=0.90):
        print(f"\n================================================================================")
        print(f"CATEGORY: {category_name.upper()} (Total: {len(items)}, K={k}, Sim Threshold={sim_threshold:.0%})")
        print(f"================================================================================")
        
        clusters = kmeans_clustering(vectors, k)
        category_dedups = []
        
        for c_id, idxs in clusters.items():
            if not idxs:
                continue
            c_items = [items[i] for i in idxs]
            print(f"\n--- Cluster #{c_id + 1} ({len(c_items)} components) ---")
            for it in c_items:
                title_or_name = it.get(name_field, '') or it.get('title', '') or it.get('brief', '')
                print(f"  • [{it[id_field][:8]}] {title_or_name[:24]:<24} | {it['new_brief']}")
                
            # Pairwise similarity & Deduplication in Cluster
            n = len(idxs)
            disabled_in_cluster = set()
            for i in range(n):
                for j in range(i + 1, n):
                    idx_a, idx_b = idxs[i], idxs[j]
                    if idx_a in disabled_in_cluster or idx_b in disabled_in_cluster:
                        continue
                    item_a, item_b = items[idx_a], items[idx_b]
                    sim = cosine_similarity(vectors[idx_a], vectors[idx_b])
                    
                    if sim >= sim_threshold:
                        name_a = item_a.get(name_field, '') or item_a.get('title', '')
                        name_b = item_b.get(name_field, '') or item_b.get('title', '')
                        print(f"\n    🚨 [DUPLICATE DETECTED] Cosine Similarity: {sim:.4f} ({sim:.2%})")
                        print(f"       Item A: [{item_a[id_field][:8]}] {name_a}")
                        print(f"               Brief: {item_a['new_brief']}")
                        print(f"       Item B: [{item_b[id_field][:8]}] {name_b}")
                        print(f"               Brief: {item_b['new_brief']}")
                        
                        # Decide victim: Keep Item A (primary/earlier or higher eval), disable Item B
                        victim = item_b
                        keeper = item_a
                        disabled_in_cluster.add(idx_b)
                        
                        category_dedups.append({
                            'victim_id': victim[id_field],
                            'victim_name': name_b,
                            'victim_brief': victim['new_brief'],
                            'keeper_id': keeper[id_field],
                            'keeper_name': name_a,
                            'keeper_brief': keeper['new_brief'],
                            'similarity': sim
                        })
                        
                        print(f"       ⚡ ACTION: Deactivating duplicate [{victim[id_field][:8]}] in favor of [{keeper[id_field][:8]}]")
                        if status_col == 'status':
                            cur.execute(f"UPDATE {table_name} SET status = ?, updated = ? WHERE id = ?", (disabled_val, now_ts, victim[id_field]))
                        else:
                            cur.execute(f"UPDATE {table_name} SET {status_col} = ?, updated = ? WHERE id = ?", (disabled_val, now_ts, victim[id_field]))

        conn.commit()
        dedup_results[category_name] = category_dedups
        print(f"\n>> Category Summary for {category_name}: {len(category_dedups)} duplicates deactivated.")

    # Execute for each category
    run_cluster_dedup('Runtime Agents', runtime_agents, runtime_agent_vecs, k=6, name_field='title', id_field='id', table_name='runtime_agent_def_record', status_col='status', disabled_val='disabled', sim_threshold=0.90)
    run_cluster_dedup('Agent Library', lib_agents, lib_agent_vecs, k=6, name_field='title', id_field='id', table_name='agent_record', status_col='enable', disabled_val=0, sim_threshold=0.92)
    run_cluster_dedup('Prompt Templates', prompts, prompt_vecs, k=5, name_field='title', id_field='id', table_name='prompt_template_record', status_col='enable', disabled_val=0, sim_threshold=0.92)
    run_cluster_dedup('Souls', souls, soul_vecs, k=6, name_field='brief', id_field='id', table_name='soul_record', status_col='enable', disabled_val=0, sim_threshold=0.90)
    run_cluster_dedup('Skills', skills, skill_vecs, k=3, name_field='title', id_field='id', table_name='skill_record', status_col='enable', disabled_val=0, sim_threshold=0.92)
    run_cluster_dedup('MCP Tools', mcps, mcp_vecs, k=2, name_field='mcp_title', id_field='id', table_name='mcp_install_record', status_col='enable', disabled_val=0, sim_threshold=0.95)

    print("\n" + "=" * 80)
    print("ALL PROCESSING COMPLETED AND COMMITTED TO DATABASE.")
    print("=" * 80)

if __name__ == '__main__':
    run_pipeline()
