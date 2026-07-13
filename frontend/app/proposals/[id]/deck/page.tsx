import { supabaseAdmin } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ASSET_DECK_CONTENT: Record<string, {
  opportunityTitle: string;
  opportunityText: string;
  activationIdeas: string[];
  packageHighlights: string[];
  campaignConcept: string;
  tvValue: string;
}> = {
  jersey: {
    opportunityTitle: "Visibilidade no Uniforme Oficial",
    opportunityText: "A camisa do Coritiba é um veículo de mídia em movimento — vista em campo, nas redes sociais, na TV e nas arquibancadas por milhares de torcedores a cada partida.",
    activationIdeas: ["Logo na camisa titular e visitante", "Aparições em TV aberta e streaming", "Conteúdo de jogadores nas redes sociais", "Camisas autografadas para ativações"],
    packageHighlights: ["Presença em todas as partidas da temporada", "Exposição em TV, streaming e cobertura jornalística", "Direito de uso da imagem da camisa em campanhas próprias", "Kit de arte oficial para aprovações"],
    campaignConcept: "Sua marca veste as cores verde e branco em cada jogo do Coritiba — do Couto Pereira à televisão nacional.",
    tvValue: "300M+ alcance acumulado em TV/streaming na temporada",
  },
  led_board: {
    opportunityTitle: "LED Perimetral — Visibilidade Máxima em Campo",
    opportunityText: "Os painéis LED do Couto Pereira garantem exposição direta durante transmissões, com presença garantida nos cortes de câmera e replays.",
    activationIdeas: ["Exibição rotativa durante partidas", "Posicionamento estratégico próximo ao gol", "Integração com momentos de gol e escanteio", "Pacote de frames por partida"],
    packageHighlights: ["Presença garantida em transmissões de TV", "Alta frequência de exposição por partida", "Coordenação com equipe de broadcast", "Relatório de exposição pós-jogo"],
    campaignConcept: "Da tela LED ao prime time: sua marca no centro das emoções do futebol paranaense.",
    tvValue: "Visibilidade comprovada em transmissões nacionais — média 45s de exposição por partida",
  },
  vip_area: {
    opportunityTitle: "Experiência VIP — B2B e Hospitalidade Premium",
    opportunityText: "O camarote do Coritiba é o ambiente ideal para relacionamento com clientes, parceiros e executivos em dias de jogo.",
    activationIdeas: ["Naming rights do camarote VIP", "Convites para clientes estratégicos", "Branding exclusivo no espaço", "Ativações de produto/serviço no matchday"],
    packageHighlights: ["Acesso VIP para convidados por jogo", "Branding no espaço e material de hospitalidade", "Foto/vídeo profissional do evento", "Integração com hospitalidade do clube"],
    campaignConcept: "Transforme o matchday em oportunidade de negócio — sua marca no centro da experiência premium do Coritiba.",
    tvValue: "Cobertura em conteúdo de bastidores e redes sociais do clube",
  },
  social_post: {
    opportunityTitle: "Presença Digital — Redes Sociais do Coritiba",
    opportunityText: "Com mais de 500 mil seguidores nas redes, o Coritiba FC conecta sua marca diretamente ao torcedor engajado.",
    activationIdeas: ["Posts patrocinados no Instagram e Facebook", "Stories e Reels com jogadores", "Conteúdo exclusivo de bastidores", "Sorteios e ativações digitais"],
    packageHighlights: ["Posts na conta oficial do clube", "Alcance orgânico qualificado", "Relatório de engajamento e alcance", "Direito de repost e compartilhamento"],
    campaignConcept: "Do estádio para o feed: sua marca na conversa digital do Coritiba com seus torcedores.",
    tvValue: "500K+ seguidores engajados nas redes sociais oficiais",
  },
  default: {
    opportunityTitle: "Por que patrocinar o Coritiba FC?",
    opportunityText: "Uma parceria com o Coritiba FC oferece visibilidade em partidas para mais de 40.000 torcedores, presença nos uniformes durante toda a temporada, e ativações criativas que conectam sua marca ao coração verde e branco do Paraná.",
    activationIdeas: ["Presença em partidas no Couto Pereira", "Exposição em TV e streaming", "Ativações digitais e nas redes sociais", "Relacionamento com jogadores e staff"],
    packageHighlights: ["Visibilidade em campo e fora dele", "Associação com clube centenário", "Acesso ao mercado paranaense", "Conteúdo co-branded"],
    campaignConcept: "Verde, branco e a sua marca — juntos pelo futebol paranaense.",
    tvValue: "300M+ alcance acumulado em TV/streaming na temporada",
  },
};

export default async function ProposalDeckPage({ params }: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const { data: proposal } = await sb
    .from("proposals")
    .select("*, companies(company_name, logo_url, industry, website)")
    .eq("id", params.id)
    .single();

  if (!proposal) notFound();

  const { data: packages } = await sb
    .from("proposal_packages")
    .select("name, description, price_brl, category")
    .eq("proposal_id", params.id);

  // Determine primary asset category from packages for dynamic content
  const primaryCategory = (packages ?? []).length > 0
    ? (packages![0].category ?? "default")
    : "default";
  const assetContent = ASSET_DECK_CONTENT[primaryCategory] ?? ASSET_DECK_CONTENT.default;

  const content = (proposal.content ?? {}) as Record<string, unknown>;
  const company = proposal.companies as { company_name: string; logo_url?: string | null; industry?: string | null } | null;
  const currentYear = new Date().getFullYear();

  return (
    <>
      <style>{`
        @page { size: A4; margin: 0; }
        .deck-wrap * { box-sizing: border-box; margin: 0; padding: 0; }
        .deck-wrap { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #e5e7eb; min-height: 100vh; padding: 0; }
        .deck-page { width: 210mm; min-height: 297mm; margin: 0 auto 32px; position: relative; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.18); }
        .deck-toolbar { width: 100%; background: #1a1a1a; padding: 12px 24px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; }
        @media print {
          .deck-toolbar { display: none !important; }
          .deck-wrap { background: white; padding: 0; }
          .deck-page { box-shadow: none; margin: 0; width: 100%; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        @media screen and (max-width: 900px) {
          .deck-page { width: 100%; min-height: auto; }
        }
      `}</style>
      <div className="deck-wrap">
        {/* Toolbar */}
        <div className="deck-toolbar">
          <div style={{color:"white",fontWeight:700,fontSize:14}}>Coritiba FC · Proposta de Patrocínio</div>
          <div style={{display:"flex",gap:8}}>
            <a
              href={`/proposals/${proposal.id}`}
              style={{background:"#374151",color:"white",border:"none",borderRadius:6,padding:"7px 14px",cursor:"pointer",fontSize:13,textDecoration:"none",display:"inline-flex",alignItems:"center",gap:6}}
            >
              ← Voltar
            </a>
            <button
              type="button"
              style={{background:"#006400",color:"white",border:"none",borderRadius:6,padding:"7px 16px",cursor:"pointer",fontSize:13,fontWeight:600}}
              onClick={undefined}
              data-print="true"
              suppressHydrationWarning
            >
              🖨 Imprimir / Salvar PDF
            </button>
            <script dangerouslySetInnerHTML={{__html:`document.querySelector('[data-print="true"]').addEventListener('click',function(){window.print()});`}} />
          </div>
        </div>

        {/* PAGE 1 — COVER */}
        <div className="deck-page" style={{background:"linear-gradient(135deg,#006400 0%,#004d00 60%,#001a00 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"48px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",marginBottom:48}}>
            <div style={{color:"white",fontSize:28,fontWeight:800,letterSpacing:-1}}>Coritiba FC</div>
            {company?.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logo_url} alt={company.company_name} style={{height:60,objectFit:"contain",filter:"brightness(0) invert(1)"}} />
            )}
          </div>
          <div style={{textAlign:"center",flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
            <div style={{color:"rgba(255,255,255,0.6)",fontSize:14,textTransform:"uppercase",letterSpacing:4,marginBottom:24}}>Proposta de Patrocínio · Temporada {currentYear}</div>
            <h1 style={{color:"white",fontSize:36,fontWeight:800,lineHeight:1.2,textAlign:"center",maxWidth:"80%",marginBottom:32}}>{proposal.title}</h1>
            <div style={{width:60,height:3,background:"#4ade80",borderRadius:2,marginBottom:32}}></div>
            <div style={{color:"rgba(255,255,255,0.8)",fontSize:18,fontWeight:500}}>{company?.company_name}</div>
          </div>
          <div style={{color:"rgba(255,255,255,0.4)",fontSize:12,textAlign:"center",marginTop:48}}>Documento confidencial · {formatDate(new Date().toISOString())} · Coritiba FC Comercial</div>
        </div>

        {/* PAGE 2 — CLUB PROFILE */}
        <div className="deck-page" style={{padding:"48px",background:"white"}}>
          <div style={{borderLeft:"4px solid #006400",paddingLeft:16,marginBottom:32}}>
            <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:3,color:"#006400",marginBottom:4}}>Sobre o Clube</div>
            <h2 style={{fontSize:28,fontWeight:700,color:"#1a1a1a"}}>Coritiba Foot Ball Club</h2>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24,marginBottom:32}}>
            {([["40.126","Capacidade do Estádio"],["1.5M+","Torcedores no Paraná"],["300M+","Alcance TV/Streaming"],["500K+","Seguidores nas Redes"]] as [string,string][]).map(([v,l]) => (
              <div key={l} style={{background:"#f0fdf4",borderRadius:12,padding:20}}>
                <div style={{fontSize:32,fontWeight:800,color:"#006400"}}>{v}</div>
                <div style={{fontSize:13,color:"#4b5563",marginTop:4}}>{l}</div>
              </div>
            ))}
          </div>
          <p style={{color:"#374151",lineHeight:1.7,fontSize:14}}>
            Fundado em 1909, o Coritiba FC é o clube mais tradicional do Paraná e um dos grandes do futebol brasileiro.
            Com um dos mais modernos estádios do país e uma torcida apaixonada, o Couto Pereira oferece uma plataforma
            de visibilidade única para marcas que buscam associação com esporte, cultura e identidade regional.
          </p>
        </div>

        {/* PAGE 3 — THE OPPORTUNITY */}
        <div className="deck-page" style={{padding:"48px",background:"white"}}>
          <div style={{borderLeft:"4px solid #006400",paddingLeft:16,marginBottom:32}}>
            <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:3,color:"#006400",marginBottom:4}}>A Oportunidade</div>
            <h2 style={{fontSize:28,fontWeight:700,color:"#1a1a1a"}}>{assetContent.opportunityTitle}</h2>
          </div>
          <div style={{marginBottom:24}}>
            <p style={{color:"#374151",lineHeight:1.7,fontSize:14,marginBottom:16}}>
              {(content.campaign_rationale as string | undefined) ?? assetContent.opportunityText}
            </p>
            {(content.sponsorship_value as string | undefined) && (
              <p style={{color:"#374151",lineHeight:1.7,fontSize:14}}>{content.sponsorship_value as string}</p>
            )}
          </div>
          <div style={{background:"#f0fdf4",borderRadius:12,padding:20}}>
            <div style={{fontSize:12,fontWeight:600,color:"#006400",textTransform:"uppercase",letterSpacing:2,marginBottom:12}}>Principais Ativações</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {assetContent.activationIdeas.map((idea, i) => (
                <div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:"#374151"}}>
                  <span style={{color:"#006400",fontWeight:700}}>→</span> {idea}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* PAGE 4 — PACKAGE */}
        <div className="deck-page" style={{padding:"48px",background:"white"}}>
          <div style={{borderLeft:"4px solid #006400",paddingLeft:16,marginBottom:32}}>
            <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:3,color:"#006400",marginBottom:4}}>Pacote de Patrocínio</div>
            <h2 style={{fontSize:28,fontWeight:700,color:"#1a1a1a"}}>O que está incluído</h2>
          </div>
          {(packages ?? []).length > 0 ? (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:24}}>
              {packages!.map((pkg, i) => (
                <div key={i} style={{padding:16,border:"1px solid #e5e7eb",borderRadius:8,background:"#f9fafb"}}>
                  <div style={{fontSize:13,fontWeight:600,color:"#1a1a1a",marginBottom:4}}>{pkg.name}</div>
                  {pkg.description && <div style={{fontSize:12,color:"#6b7280",marginBottom:8}}>{pkg.description}</div>}
                  {pkg.price_brl && <div style={{fontSize:14,fontWeight:700,color:"#006400"}}>R$ {Number(pkg.price_brl).toLocaleString("pt-BR")}</div>}
                </div>
              ))}
            </div>
          ) : (content.deliverables as string[] | undefined)?.length ? (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:24}}>
              {(content.deliverables as string[]).map((d, i) => (
                <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:12,border:"1px solid #e5e7eb",borderRadius:8}}>
                  <div style={{width:20,height:20,borderRadius:"50%",background:"#006400",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <span style={{color:"white",fontSize:11,fontWeight:700}}>✓</span>
                  </div>
                  <span style={{fontSize:13,color:"#374151",lineHeight:1.5}}>{d}</span>
                </div>
              ))}
            </div>
          ) : null}
          <div style={{background:"#f0fdf4",borderRadius:12,padding:16}}>
            <div style={{fontSize:11,fontWeight:600,color:"#006400",textTransform:"uppercase",letterSpacing:2,marginBottom:10}}>Destaques do Pacote</div>
            {assetContent.packageHighlights.map((h, i) => (
              <div key={i} style={{display:"flex",gap:8,fontSize:13,color:"#374151",marginBottom:6}}>
                <span style={{color:"#006400",fontWeight:700,flexShrink:0}}>✓</span> {h}
              </div>
            ))}
            <div style={{marginTop:12,padding:12,background:"#dcfce7",borderRadius:8,fontSize:12,color:"#14532d",fontWeight:500}}>
              📺 {assetContent.tvValue}
            </div>
          </div>
        </div>

        {/* PAGE 5 — CAMPAIGN CONCEPT */}
        <div className="deck-page" style={{padding:"48px",background:"linear-gradient(135deg,#006400 0%,#004d00 100%)",display:"flex",flexDirection:"column",justifyContent:"center"}}>
          <div style={{borderLeft:"4px solid #4ade80",paddingLeft:16,marginBottom:32}}>
            <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:3,color:"#86efac",marginBottom:4}}>Conceito de Campanha</div>
            <h2 style={{fontSize:28,fontWeight:700,color:"white"}}>{(content.campaign_name as string | undefined) ?? "Campanha Verde e Branco"}</h2>
          </div>
          <p style={{color:"rgba(255,255,255,0.9)",lineHeight:1.7,fontSize:15,marginBottom:24}}>
            {(content.campaign_concept as string | undefined) ?? assetContent.campaignConcept}
          </p>
          {(content.cta as string | undefined) && (
            <div style={{background:"rgba(255,255,255,0.1)",borderRadius:12,padding:20}}>
              <p style={{color:"#86efac",fontSize:16,fontWeight:600}}>{content.cta as string}</p>
            </div>
          )}
        </div>

        {/* PAGE 6 — INVESTMENT */}
        <div className="deck-page" style={{padding:"48px",background:"white"}}>
          <div style={{borderLeft:"4px solid #006400",paddingLeft:16,marginBottom:32}}>
            <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:3,color:"#006400",marginBottom:4}}>Investimento</div>
            <h2 style={{fontSize:28,fontWeight:700,color:"#1a1a1a"}}>Condições Comerciais</h2>
          </div>
          {(content.investment_note as string | undefined) && (
            <div style={{background:"#f0fdf4",border:"2px solid #006400",borderRadius:12,padding:24,marginBottom:24}}>
              <p style={{color:"#1a1a1a",fontSize:15,lineHeight:1.7}}>{content.investment_note as string}</p>
            </div>
          )}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            {([["Formato","Patrocínio Direto"],["Vigência",`Temporada ${currentYear}`],["Forma de Pagamento","A definir em contrato"],["Validade da Proposta","30 dias"]] as [string,string][]).map(([k,v]) => (
              <div key={k} style={{padding:16,border:"1px solid #e5e7eb",borderRadius:8}}>
                <div style={{fontSize:11,color:"#9ca3af",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>{k}</div>
                <div style={{fontSize:14,fontWeight:600,color:"#1a1a1a"}}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* PAGE 7 — VISUAL MOCKUPS */}
        <div className="deck-page" style={{padding:"48px",background:"#f9fafb",display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center"}}>
          <div style={{borderLeft:"4px solid #006400",paddingLeft:16,marginBottom:32,alignSelf:"flex-start"}}>
            <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:3,color:"#006400",marginBottom:4}}>Visuais da Campanha</div>
            <h2 style={{fontSize:28,fontWeight:700,color:"#1a1a1a"}}>Mockups e Criações</h2>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,width:"100%"}}>
            {(["Jersey Mockup","LED Board","Post de Redes Sociais","Backdrop de Imprensa"] as string[]).map(label => (
              <div key={label} style={{background:"#e5e7eb",borderRadius:12,height:150,display:"flex",alignItems:"center",justifyContent:"center"}}>
                <span style={{color:"#9ca3af",fontSize:13}}>{label}</span>
              </div>
            ))}
          </div>
          <p style={{color:"#9ca3af",fontSize:12,marginTop:16,textAlign:"center"}}>Mockups definitivos gerados após aprovação da proposta</p>
        </div>

        {/* PAGE 8 — NEXT STEPS */}
        <div className="deck-page" style={{padding:"48px",background:"linear-gradient(135deg,#006400 0%,#004d00 100%)",display:"flex",flexDirection:"column",justifyContent:"center"}}>
          <div style={{borderLeft:"4px solid #4ade80",paddingLeft:16,marginBottom:40}}>
            <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:3,color:"#86efac",marginBottom:4}}>Próximos Passos</div>
            <h2 style={{fontSize:28,fontWeight:700,color:"white"}}>Como avançar</h2>
          </div>
          <div>
            {(([
              ["01","Confirme seu interesse","Responda este email ou clique em Tenho Interesse na proposta online"],
              ["02","Reunião de alinhamento","Agendamos uma apresentação de 30 minutos com nossa equipe comercial"],
              ["03","Proposta final","Ajustamos os detalhes e enviamos o contrato para assinatura"],
            ]) as [string,string,string][]).map(([n,t,desc]) => (
              <div key={n} style={{display:"flex",gap:20,marginBottom:24}}>
                <div style={{width:40,height:40,borderRadius:"50%",background:"#4ade80",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <span style={{color:"#006400",fontWeight:800,fontSize:16}}>{n}</span>
                </div>
                <div>
                  <div style={{color:"white",fontWeight:600,fontSize:15,marginBottom:4}}>{t}</div>
                  <div style={{color:"rgba(255,255,255,0.7)",fontSize:13}}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{marginTop:40,borderTop:"1px solid rgba(255,255,255,0.2)",paddingTop:24}}>
            <div style={{color:"rgba(255,255,255,0.6)",fontSize:11,textAlign:"center"}}>
              Coritiba FC · Departamento Comercial · comercial@coritiba.com.br<br/>
              Rua Campo Comprido, 669 · Curitiba · PR · CNPJ 75.094.050/0001-72
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
