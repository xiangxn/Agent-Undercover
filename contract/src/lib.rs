use std::collections::BTreeMap;

use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;
use near_sdk::{
    env, near, require, AccountId, NearToken, PanicOnDefault, Promise,
};
use near_sdk::serde::{Deserialize, Serialize};

pub type RoomId = String;

const MAX_DESCRIPTION_BYTES: usize = 280;
const MAX_ROOM_ID_BYTES: usize = 64;
const LOBBY_SECONDS: u64 = 600;
const DESCRIBE_SECONDS: u64 = 180;
const VOTE_COMMIT_SECONDS: u64 = 120;
const VOTE_REVEAL_SECONDS: u64 = 120;
const ROLE_REVEAL_SECONDS: u64 = 120;
const SETTLE_SECONDS: u64 = 600;
const GAME_SECONDS: u64 = 3600;

#[derive(
    BorshSerialize,
    BorshDeserialize,
    Serialize,
    Deserialize,
    Clone,
    Copy,
    PartialEq,
    Eq,
    Debug,
)]
#[serde(crate = "near_sdk::serde", rename_all = "lowercase")]
pub enum Phase {
    Lobby,
    Describing,
    VoteCommit,
    VoteReveal,
    RoleReveal,
    Finished,
    Settled,
    Refunded,
}

#[derive(
    BorshSerialize,
    BorshDeserialize,
    Serialize,
    Deserialize,
    Clone,
    Copy,
    PartialEq,
    Eq,
    Debug,
)]
#[serde(crate = "near_sdk::serde", rename_all = "lowercase")]
pub enum Role {
    Crew,
    Impostor,
}

#[derive(
    BorshSerialize,
    BorshDeserialize,
    Serialize,
    Deserialize,
    Clone,
    Copy,
    PartialEq,
    Eq,
    Debug,
)]
#[serde(crate = "near_sdk::serde", rename_all = "lowercase")]
pub enum Side {
    Crew,
    Impostors,
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct Player {
    pub account: AccountId,
    pub is_agent: bool,
    pub alive: bool,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug)]
pub struct Room {
    pub id: RoomId,
    pub host: AccountId,
    pub stake: u128,
    pub max_players: u8,
    pub impostor_count: u8,
    pub max_rounds: u8,
    pub players: Vec<Player>,
    pub phase: Phase,
    pub round: u8,
    pub pot: u128,
    pub pending_exile: Option<AccountId>,
    pub winning_side: Option<Side>,
    pub exiles: Vec<AccountId>,
    pub winners: Vec<AccountId>,
    pub created_at: u64,
    pub phase_deadline: u64,
    pub game_deadline: u64,
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Default, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct AgentStats {
    pub games: u32,
    pub wins: u32,
    pub losses: u32,
    pub earnings_yocto: i128,
    pub last_played: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct RoleRevealInput {
    pub player: AccountId,
    pub role: Role,
    pub salt: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct RoomView {
    pub id: RoomId,
    pub host: AccountId,
    pub stake: String,
    pub max_players: u8,
    pub impostor_count: u8,
    pub max_rounds: u8,
    pub players: Vec<Player>,
    pub phase: Phase,
    pub round: u8,
    pub pot: String,
    pub pending_exile: Option<AccountId>,
    pub winning_side: Option<Side>,
    pub exiles: Vec<AccountId>,
    pub winners: Vec<AccountId>,
    pub created_at: u64,
    pub phase_deadline: u64,
    pub game_deadline: u64,
}

impl RoomView {
    fn from_room(room: &Room) -> Self {
        Self {
            id: room.id.clone(),
            host: room.host.clone(),
            stake: room.stake.to_string(),
            max_players: room.max_players,
            impostor_count: room.impostor_count,
            max_rounds: room.max_rounds,
            players: room.players.clone(),
            phase: room.phase,
            round: room.round,
            pot: room.pot.to_string(),
            pending_exile: room.pending_exile.clone(),
            winning_side: room.winning_side,
            exiles: room.exiles.clone(),
            winners: room.winners.clone(),
            created_at: room.created_at,
            phase_deadline: room.phase_deadline,
            game_deadline: room.game_deadline,
        }
    }
}

#[derive(Serialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct AgentStatsView {
    pub account: AccountId,
    pub games: u32,
    pub wins: u32,
    pub losses: u32,
    pub earnings_yocto: String,
    pub last_played: u64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct RoundView {
    pub round: u8,
    pub descriptions: Vec<(AccountId, String)>,
    pub votes: Vec<(AccountId, AccountId)>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    game_master: AccountId,
    room_count: u64,
    rooms: LookupMap<RoomId, Room>,
    role_commitments: LookupMap<(RoomId, AccountId), String>,
    role_reveals: LookupMap<(RoomId, AccountId), Role>,
    descriptions: LookupMap<(RoomId, u32, AccountId), String>,
    vote_commits: LookupMap<(RoomId, u32, AccountId), String>,
    votes: LookupMap<(RoomId, u32, AccountId), AccountId>,
    vote_revealed: LookupMap<(RoomId, u32, AccountId), bool>,
    agent_stats: LookupMap<AccountId, AgentStats>,
}

#[near]
impl Contract {
    #[init]
    pub fn new(game_master: AccountId) -> Self {
        Self {
            game_master,
            room_count: 0,
            rooms: LookupMap::new(b"r"),
            role_commitments: LookupMap::new(b"c"),
            role_reveals: LookupMap::new(b"v"),
            descriptions: LookupMap::new(b"d"),
            vote_commits: LookupMap::new(b"m"),
            votes: LookupMap::new(b"o"),
            vote_revealed: LookupMap::new(b"x"),
            agent_stats: LookupMap::new(b"s"),
        }
    }

    // ---------------------------------------------------------------------
    // Lobby
    // ---------------------------------------------------------------------

    #[payable]
    pub fn create_room(
        &mut self,
        room_id: RoomId,
        stake: U128,
        max_players: u8,
        impostor_count: u8,
        max_rounds: u8,
    ) -> RoomId {
        let stake = stake.0;
        require!(
            !room_id.is_empty() && room_id.len() <= MAX_ROOM_ID_BYTES,
            "Invalid room id"
        );
        require!(
            (2..=6).contains(&max_players),
            "max_players must be between 2 and 6"
        );
        require!(
            impostor_count >= 1 && impostor_count < max_players,
            "Invalid impostor count"
        );
        require!(
            (1..=5).contains(&max_rounds),
            "max_rounds must be between 1 and 5"
        );
        require!(stake > 0, "Stake must be positive");
        require!(
            env::attached_deposit().as_yoctonear() == stake,
            "Attached deposit must equal stake"
        );
        require!(
            !self.rooms.contains_key(&room_id),
            "Room already exists"
        );

        let host = env::predecessor_account_id();
        let now = now_secs();
        let room = Room {
            id: room_id.clone(),
            host: host.clone(),
            stake,
            max_players,
            impostor_count,
            max_rounds,
            players: vec![Player {
                account: host,
                is_agent: false,
                alive: true,
            }],
            phase: Phase::Lobby,
            round: 0,
            pot: stake,
            pending_exile: None,
            winning_side: None,
            exiles: Vec::new(),
            winners: Vec::new(),
            created_at: now,
            phase_deadline: now + LOBBY_SECONDS,
            game_deadline: 0,
        };

        self.rooms.insert(room_id.clone(), room);
        self.room_count += 1;
        room_id
    }

    #[payable]
    pub fn join_room(&mut self, room_id: RoomId) {
        let caller = env::predecessor_account_id();
        let mut room = self.room_or_panic(&room_id);
        require!(room.phase == Phase::Lobby, "Room is not in the lobby");
        require!(
            env::attached_deposit().as_yoctonear() == room.stake,
            "Attached deposit must equal stake"
        );
        require!(
            !room.players.iter().any(|p| p.account == caller),
            "Already joined"
        );
        require!(
            (room.players.len() as u8) < room.max_players,
            "Room is full"
        );

        room.players.push(Player {
            account: caller,
            is_agent: false,
            alive: true,
        });
        room.pot += room.stake;
        self.rooms.insert(room_id, room);
    }

    /// Game master starts the game. `role_commitments` must cover every
    /// player with `sha256(role + ":" + salt)`. `agent_accounts` marks which
    /// seats are operated by persistent agent accounts.
    pub fn start_game(
        &mut self,
        room_id: RoomId,
        role_commitments: Vec<(AccountId, String)>,
        agent_accounts: Vec<AccountId>,
    ) {
        self.assert_game_master();
        let mut room = self.room_or_panic(&room_id);
        require!(room.phase == Phase::Lobby, "Room is not in the lobby");
        require!(
            room.players.len() == room.max_players as usize,
            "All seats must be filled"
        );
        require!(
            role_commitments.len() == room.players.len(),
            "Commitment missing for a player"
        );

        let mut seen: Vec<AccountId> = Vec::new();
        for (account, commitment) in role_commitments.iter() {
            require!(
                room.players.iter().any(|p| &p.account == account),
                "Commitment for an unknown player"
            );
            require!(!seen.contains(account), "Duplicate commitment");
            require!(valid_hash(commitment), "Invalid role commitment");
            seen.push(account.clone());
        }

        for account in agent_accounts.iter() {
            require!(
                room.players.iter().any(|p| &p.account == account),
                "Agent is not a player"
            );
        }
        for player in room.players.iter_mut() {
            player.is_agent = agent_accounts.contains(&player.account);
        }
        for (account, commitment) in role_commitments.into_iter() {
            self.role_commitments
                .insert((room_id.clone(), account), commitment.to_lowercase());
        }

        let now = now_secs();
        room.phase = Phase::Describing;
        room.round = 1;
        room.phase_deadline = now + DESCRIBE_SECONDS;
        room.game_deadline = now + GAME_SECONDS;
        self.rooms.insert(room_id, room);
    }

    // ---------------------------------------------------------------------
    // Round phases
    // ---------------------------------------------------------------------

    pub fn submit_description(&mut self, room_id: RoomId, text: String) {
        let caller = env::predecessor_account_id();
        let mut room = self.room_or_panic(&room_id);
        require!(room.phase == Phase::Describing, "Not in Describing");
        let index = player_index_or_panic(&room, &caller);
        require!(room.players[index].alive, "Player is not alive");
        require!(!text.trim().is_empty(), "Description is empty");
        require!(
            text.len() <= MAX_DESCRIPTION_BYTES,
            "Description is too long"
        );

        let key = (room_id.clone(), room.round as u32, caller);
        require!(
            !self.descriptions.contains_key(&key),
            "Description already submitted"
        );
        self.descriptions.insert(key, text);

        if self.all_alive_submitted(&room) {
            room.phase = Phase::VoteCommit;
            room.phase_deadline = now_secs() + VOTE_COMMIT_SECONDS;
        }
        self.rooms.insert(room_id, room);
    }

    pub fn commit_vote(&mut self, room_id: RoomId, commitment: String) {
        let caller = env::predecessor_account_id();
        let mut room = self.room_or_panic(&room_id);
        require!(room.phase == Phase::VoteCommit, "Not in VoteCommit");
        let index = player_index_or_panic(&room, &caller);
        require!(room.players[index].alive, "Player is not alive");
        require!(valid_hash(&commitment), "Invalid vote commitment");

        let key = (room_id.clone(), room.round as u32, caller);
        require!(
            !self.vote_commits.contains_key(&key),
            "Vote already committed"
        );
        self.vote_commits.insert(key, commitment.to_lowercase());

        if self.all_alive_committed(&room) {
            room.phase = Phase::VoteReveal;
            room.phase_deadline = now_secs() + VOTE_REVEAL_SECONDS;
        }
        self.rooms.insert(room_id, room);
    }

    pub fn reveal_vote(&mut self, room_id: RoomId, target: AccountId, salt: String) {
        let caller = env::predecessor_account_id();
        let mut room = self.room_or_panic(&room_id);
        require!(room.phase == Phase::VoteReveal, "Not in VoteReveal");
        let index = player_index_or_panic(&room, &caller);
        require!(room.players[index].alive, "Player is not alive");
        require!(target != caller, "Cannot vote for yourself");
        let target_index = player_index_or_panic(&room, &target);
        require!(room.players[target_index].alive, "Target is not alive");

        let key = (room_id.clone(), room.round as u32, caller.clone());
        require!(
            !self.vote_revealed.get(&key).copied().unwrap_or(false),
            "Vote already revealed"
        );
        let commitment = self
            .vote_commits
            .get(&key)
            .unwrap_or_else(|| env::panic_str("No vote commitment"));
        require!(
            commitment == &hash_commitment(target.as_str(), &salt),
            "Vote reveal does not match commitment"
        );

        self.votes.insert(key.clone(), target);
        self.vote_revealed.insert(key, true);

        if self.all_alive_revealed(&room) {
            self.tally(&mut room);
        }
        self.rooms.insert(room_id, room);
    }

    pub fn reveal_role(&mut self, room_id: RoomId, player: AccountId, role: Role, salt: String) {
        self.assert_game_master();
        let mut room = self.room_or_panic(&room_id);
        require!(room.phase == Phase::RoleReveal, "Not in RoleReveal");
        require!(
            room.pending_exile.as_ref() == Some(&player),
            "Player is not the pending exile"
        );
        let key = (room_id.clone(), player.clone());
        require!(
            !self.role_reveals.contains_key(&key),
            "Role already revealed"
        );
        let commitment = self
            .role_commitments
            .get(&key)
            .unwrap_or_else(|| env::panic_str("No role commitment"));
        require!(
            commitment == &hash_commitment(role_str(role), &salt),
            "Role reveal does not match commitment"
        );

        self.role_reveals.insert(key, role);
        room.phase_deadline = now_secs() + ROLE_REVEAL_SECONDS;
        self.rooms.insert(room_id, room);
    }

    /// Anyone may advance once the exiled role has been revealed (or when the
    /// vote was tied and there is no exile).
    pub fn advance(&mut self, room_id: RoomId) {
        let mut room = self.room_or_panic(&room_id);
        require!(room.phase == Phase::RoleReveal, "Not in RoleReveal");
        if let Some(exile) = room.pending_exile.clone() {
            require!(
                self.role_reveals
                    .contains_key(&(room_id.clone(), exile)),
                "Exiled role has not been revealed"
            );
        }
        self.finish_round(&mut room);
        self.rooms.insert(room_id, room);
    }

    // ---------------------------------------------------------------------
    // Settlement
    // ---------------------------------------------------------------------

    /// Anyone can settle a finished game by submitting every role + salt.
    /// The contract verifies each commitment before paying anyone.
    pub fn settle(&mut self, room_id: RoomId, role_reveals: Vec<RoleRevealInput>) {
        let mut room = self.room_or_panic(&room_id);
        require!(room.phase == Phase::Finished, "Game is not finished");
        let winning_side = room
            .winning_side
            .unwrap_or_else(|| env::panic_str("Winning side is not set"));
        require!(
            role_reveals.len() == room.players.len(),
            "Role reveal missing for a player"
        );

        let mut seen: Vec<AccountId> = Vec::new();
        let mut impostors: u8 = 0;
        let mut roles: BTreeMap<AccountId, Role> = BTreeMap::new();

        for input in role_reveals.iter() {
            require!(
                room.players.iter().any(|p| p.account == input.player),
                "Role reveal for an unknown player"
            );
            require!(!seen.contains(&input.player), "Duplicate role reveal");
            let key = (room_id.clone(), input.player.clone());
            let commitment = self
                .role_commitments
                .get(&key)
                .unwrap_or_else(|| env::panic_str("No role commitment"));
            require!(
                commitment == &hash_commitment(role_str(input.role), &input.salt),
                "Role reveal does not match commitment"
            );
            if let Some(existing) = self.role_reveals.get(&key) {
                require!(
                    existing == &input.role,
                    "Role differs from the earlier reveal"
                );
            }
            if input.role == Role::Impostor {
                impostors += 1;
            }
            seen.push(input.player.clone());
            roles.insert(input.player.clone(), input.role);
        }
        require!(
            impostors == room.impostor_count,
            "Impostor count does not match the room"
        );

        let winners: Vec<AccountId> = room
            .players
            .iter()
            .filter(|p| p.alive && side_of(roles[&p.account]) == winning_side)
            .map(|p| p.account.clone())
            .collect();

        if winners.is_empty() {
            // Defensive fallback; normally unreachable.
            for player in room.players.iter() {
                Promise::new(player.account.clone())
                    .transfer(NearToken::from_yoctonear(room.stake))
                    .detach();
            }
            room.phase = Phase::Refunded;
            room.pot = 0;
            self.rooms.insert(room_id, room);
            return;
        }

        let pot = room.pot;
        let winner_count = winners.len() as u128;
        let payout = pot / winner_count;
        let remainder = pot % winner_count;

        for (index, winner) in winners.iter().enumerate() {
            let amount = payout + if index == 0 { remainder } else { 0 };
            Promise::new(winner.clone())
                .transfer(NearToken::from_yoctonear(amount))
                .detach();
        }

        let now = now_secs();
        for player in room.players.iter() {
            if !player.is_agent {
                continue;
            }
            let position = winners.iter().position(|w| w == &player.account);
            let amount = match position {
                Some(index) => payout + if index == 0 { remainder } else { 0 },
                None => 0,
            };
            let mut stats = self
                .agent_stats
                .get(&player.account)
                .cloned()
                .unwrap_or_default();
            stats.games += 1;
            if position.is_some() {
                stats.wins += 1;
            } else {
                stats.losses += 1;
            }
            stats.earnings_yocto += amount as i128 - room.stake as i128;
            stats.last_played = now;
            self.agent_stats.insert(player.account.clone(), stats);
        }

        for input in role_reveals.into_iter() {
            self.role_reveals
                .insert((room_id.clone(), input.player), input.role);
        }

        room.winners = winners;
        room.phase = Phase::Settled;
        room.pot = 0;
        room.game_deadline = now + SETTLE_SECONDS;
        self.rooms.insert(room_id, room);
    }

    /// Refund every stake after the lobby or game deadline has passed.
    pub fn refund(&mut self, room_id: RoomId) {
        let mut room = self.room_or_panic(&room_id);
        require!(
            room.phase != Phase::Settled && room.phase != Phase::Refunded,
            "Game already finalized"
        );
        let now = now_secs();
        let lobby_timeout = room.phase == Phase::Lobby && now >= room.phase_deadline;
        let game_timeout = room.game_deadline > 0 && now >= room.game_deadline;
        require!(lobby_timeout || game_timeout, "Deadline has not passed");
        require!(
            room.pot == room.stake * room.players.len() as u128,
            "Pot does not match the stakes"
        );

        for player in room.players.iter() {
            Promise::new(player.account.clone())
                .transfer(NearToken::from_yoctonear(room.stake))
                .detach();
        }
        room.phase = Phase::Refunded;
        room.pot = 0;
        self.rooms.insert(room_id, room);
    }

    /// Game master may skip stalled phases once the phase deadline passes.
    pub fn force_advance(&mut self, room_id: RoomId) {
        self.assert_game_master();
        let mut room = self.room_or_panic(&room_id);
        let now = now_secs();
        require!(now >= room.phase_deadline, "Phase deadline has not passed");

        match room.phase {
            Phase::Describing => {
                room.phase = Phase::VoteCommit;
                room.phase_deadline = now + VOTE_COMMIT_SECONDS;
            }
            Phase::VoteCommit => {
                room.phase = Phase::VoteReveal;
                room.phase_deadline = now + VOTE_REVEAL_SECONDS;
            }
            Phase::VoteReveal => {
                self.tally(&mut room);
            }
            Phase::RoleReveal => {
                if let Some(exile) = room.pending_exile.clone() {
                    if !self
                        .role_reveals
                        .contains_key(&(room_id.clone(), exile))
                    {
                        // No reveal: treat the round as no exile rather than
                        // leaving the pot stuck forever.
                        room.pending_exile = None;
                    }
                }
                self.finish_round(&mut room);
            }
            _ => env::panic_str("Cannot force advance in this phase"),
        }
        self.rooms.insert(room_id, room);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    pub fn get_game_master(&self) -> AccountId {
        self.game_master.clone()
    }

    pub fn get_room_count(&self) -> u64 {
        self.room_count
    }

    pub fn get_room(&self, room_id: RoomId) -> RoomView {
        RoomView::from_room(&self.room_or_panic(&room_id))
    }

    pub fn get_round(&self, room_id: RoomId, round: u8) -> RoundView {
        let room = self.room_or_panic(&room_id);
        let mut descriptions = Vec::new();
        let mut votes = Vec::new();
        for player in room.players.iter() {
            let key = (room_id.clone(), round as u32, player.account.clone());
            if let Some(text) = self.descriptions.get(&key) {
                descriptions.push((player.account.clone(), text.clone()));
            }
            if self.vote_revealed.get(&key).copied().unwrap_or(false) {
                if let Some(target) = self.votes.get(&key) {
                    votes.push((player.account.clone(), target.clone()));
                }
            }
        }
        RoundView {
            round,
            descriptions,
            votes,
        }
    }

    pub fn get_role(&self, room_id: RoomId, account: AccountId) -> Option<Role> {
        self.role_reveals
            .get(&(room_id, account))
            .copied()
    }

    pub fn get_agent_stats(&self, account: AccountId) -> Option<AgentStatsView> {
        self.agent_stats.get(&account).map(|stats| AgentStatsView {
            account,
            games: stats.games,
            wins: stats.wins,
            losses: stats.losses,
            earnings_yocto: stats.earnings_yocto.to_string(),
            last_played: stats.last_played,
        })
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    fn room_or_panic(&self, room_id: &RoomId) -> Room {
        self.rooms
            .get(room_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Room not found"))
    }

    fn assert_game_master(&self) {
        require!(
            env::predecessor_account_id() == self.game_master,
            "Only the game master"
        );
    }

    fn all_alive_submitted(&self, room: &Room) -> bool {
        room.players.iter().filter(|p| p.alive).all(|p| {
            self.descriptions
                .contains_key(&(room.id.clone(), room.round as u32, p.account.clone()))
        })
    }

    fn all_alive_committed(&self, room: &Room) -> bool {
        room.players.iter().filter(|p| p.alive).all(|p| {
            self.vote_commits
                .contains_key(&(room.id.clone(), room.round as u32, p.account.clone()))
        })
    }

    fn all_alive_revealed(&self, room: &Room) -> bool {
        room.players.iter().filter(|p| p.alive).all(|p| {
            self.vote_revealed
                .get(&(room.id.clone(), room.round as u32, p.account.clone()))
                .copied()
                .unwrap_or(false)
        })
    }

    fn tally(&mut self, room: &mut Room) {
        let mut counts: BTreeMap<AccountId, u32> = BTreeMap::new();
        for player in room.players.iter().filter(|p| p.alive) {
            let key = (room.id.clone(), room.round as u32, player.account.clone());
            if self.vote_revealed.get(&key).copied().unwrap_or(false) {
                if let Some(target) = self.votes.get(&key) {
                    *counts.entry(target.clone()).or_insert(0) += 1;
                }
            }
        }

        let max_votes = counts.values().copied().max().unwrap_or(0);
        let top: Vec<AccountId> = if max_votes == 0 {
            Vec::new()
        } else {
            counts
                .into_iter()
                .filter(|(_, count)| *count == max_votes)
                .map(|(account, _)| account)
                .collect()
        };

        room.pending_exile = if top.len() == 1 {
            Some(top[0].clone())
        } else {
            None
        };
        room.phase = Phase::RoleReveal;
        room.phase_deadline = now_secs() + ROLE_REVEAL_SECONDS;
    }

    fn finish_round(&mut self, room: &mut Room) {
        if let Some(exile) = room.pending_exile.clone() {
            let index = player_index_or_panic(room, &exile);
            room.players[index].alive = false;
            room.exiles.push(exile);
        }
        room.pending_exile = None;

        let exiled_impostors = room
            .players
            .iter()
            .filter(|p| {
                !p.alive
                    && self
                        .role_reveals
                        .get(&(room.id.clone(), p.account.clone()))
                        .copied()
                        == Some(Role::Impostor)
            })
            .count() as u8;
        let alive_impostors = room.impostor_count.saturating_sub(exiled_impostors);
        let alive_players = room.players.iter().filter(|p| p.alive).count() as u8;
        let alive_crew = alive_players.saturating_sub(alive_impostors);

        let winning_side = if alive_impostors == 0 {
            Some(Side::Crew)
        } else if alive_impostors >= alive_crew {
            Some(Side::Impostors)
        } else if room.round >= room.max_rounds {
            Some(Side::Impostors)
        } else {
            None
        };

        let now = now_secs();
        if let Some(side) = winning_side {
            room.phase = Phase::Finished;
            room.winning_side = Some(side);
            room.phase_deadline = now + SETTLE_SECONDS;
            room.game_deadline = now + SETTLE_SECONDS;
        } else {
            room.round += 1;
            room.phase = Phase::Describing;
            room.phase_deadline = now + DESCRIBE_SECONDS;
        }
    }
}

fn now_secs() -> u64 {
    env::block_timestamp() / 1_000_000_000
}

fn valid_hash(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn hash_commitment(value: &str, salt: &str) -> String {
    let input = format!("{value}:{salt}");
    hex::encode(env::sha256(input.as_bytes()))
}

fn role_str(role: Role) -> &'static str {
    match role {
        Role::Crew => "crew",
        Role::Impostor => "impostor",
    }
}

fn side_of(role: Role) -> Side {
    match role {
        Role::Crew => Side::Crew,
        Role::Impostor => Side::Impostors,
    }
}

fn player_index_or_panic(room: &Room, account: &AccountId) -> usize {
    room.players
        .iter()
        .position(|p| &p.account == account)
        .unwrap_or_else(|| env::panic_str("Not a player"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;
    use near_sdk::VMContext;

    const STAKE: u128 = 100_000_000_000_000_000_000_000; // 0.1 NEAR

    fn ctx(account: &str, deposit: u128, ts: u64) -> VMContext {
        VMContextBuilder::new()
            .predecessor_account_id(account.parse().unwrap())
            .signer_account_id(account.parse().unwrap())
            .attached_deposit(NearToken::from_yoctonear(deposit))
            .block_timestamp(ts * 1_000_000_000)
            .build()
    }

    fn account(name: &str) -> AccountId {
        name.parse().unwrap()
    }

    fn new_contract() -> Contract {
        testing_env!(ctx("gm.testnet", 0, 1_000));
        Contract::new(account("gm.testnet"))
    }

    fn create_and_fill(contract: &mut Contract) -> Vec<AccountId> {
        testing_env!(ctx("host.testnet", STAKE, 1_001));
        contract.create_room("room-1".into(), U128(STAKE), 5, 1, 3);

        let players = ["p1.testnet", "p2.testnet", "p3.testnet", "p4.testnet"];
        for (index, player) in players.iter().enumerate() {
            testing_env!(ctx(player, STAKE, 1_002 + index as u64));
            contract.join_room("room-1".into());
        }

        let all: Vec<AccountId> = std::iter::once(account("host.testnet"))
            .chain(players.iter().map(|p| account(p)))
            .collect();
        all
    }

    fn start(contract: &mut Contract, players: &[AccountId]) {
        let commitments: Vec<(AccountId, String)> = players
            .iter()
            .map(|player| {
                let role = if player == &account("host.testnet") {
                    "impostor"
                } else {
                    "crew"
                };
                (player.clone(), hash_commitment(role, &format!("salt-{player}")))
            })
            .collect();
        let agents: Vec<AccountId> = players
            .iter()
            .filter(|p| p.as_str() != "host.testnet")
            .cloned()
            .collect();
        testing_env!(ctx("gm.testnet", 0, 1_010));
        contract.start_game("room-1".into(), commitments, agents);
    }

    fn describe_all(contract: &mut Contract, players: &[AccountId]) {
        for (index, player) in players.iter().enumerate() {
            testing_env!(ctx(player.as_str(), 0, 1_020 + index as u64));
            contract.submit_description("room-1".into(), format!("description {index}"));
        }
    }

    fn commit_all(contract: &mut Contract, players: &[AccountId], target: &AccountId) {
        for (index, player) in players.iter().enumerate() {
            testing_env!(ctx(player.as_str(), 0, 1_030 + index as u64));
            contract.commit_vote(
                "room-1".into(),
                hash_commitment(target.as_str(), &format!("vote-{player}")),
            );
        }
    }

    #[test]
    fn full_game_crew_wins_and_agents_are_paid() {
        let mut contract = new_contract();
        let players = create_and_fill(&mut contract);
        start(&mut contract, &players);
        describe_all(&mut contract, &players);

        let targets: Vec<AccountId> = players
            .iter()
            .map(|player| {
                if player == &account("host.testnet") {
                    account("p1.testnet")
                } else {
                    account("host.testnet")
                }
            })
            .collect();
        for (index, player) in players.iter().enumerate() {
            testing_env!(ctx(player.as_str(), 0, 1_030 + index as u64));
            contract.commit_vote(
                "room-1".into(),
                hash_commitment(targets[index].as_str(), &format!("vote-{player}")),
            );
        }
        for (index, player) in players.iter().enumerate() {
            testing_env!(ctx(player.as_str(), 0, 1_040 + index as u64));
            contract.reveal_vote(
                "room-1".into(),
                targets[index].clone(),
                format!("vote-{player}"),
            );
        }

        let room = contract.get_room("room-1".into());
        assert_eq!(room.phase, Phase::RoleReveal);
        assert_eq!(room.pending_exile, Some(account("host.testnet")));

        testing_env!(ctx("gm.testnet", 0, 1_050));
        contract.reveal_role(
            "room-1".into(),
            account("host.testnet"),
            Role::Impostor,
            "salt-host.testnet".into(),
        );

        testing_env!(ctx("p1.testnet", 0, 1_051));
        contract.advance("room-1".into());

        let room = contract.get_room("room-1".into());
        assert_eq!(room.phase, Phase::Finished);
        assert_eq!(room.winning_side, Some(Side::Crew));

        let reveals: Vec<RoleRevealInput> = players
            .iter()
            .map(|player| {
                let role = if player == &account("host.testnet") {
                    Role::Impostor
                } else {
                    Role::Crew
                };
                RoleRevealInput {
                    player: player.clone(),
                    role,
                    salt: format!("salt-{player}"),
                }
            })
            .collect();

        testing_env!(ctx("p1.testnet", 0, 1_060));
        contract.settle("room-1".into(), reveals);

        let room = contract.get_room("room-1".into());
        assert_eq!(room.phase, Phase::Settled);
        assert_eq!(room.pot, "0".to_string());
        assert_eq!(room.winners.len(), 4);
        assert!(!room.winners.contains(&account("host.testnet")));

        let stats = contract.get_agent_stats(account("p1.testnet")).unwrap();
        assert_eq!(stats.games, 1);
        assert_eq!(stats.wins, 1);
        assert_eq!(stats.losses, 0);
        // 0.5 NEAR pot / 4 winners = 0.125 NEAR, minus the 0.1 NEAR stake.
        assert_eq!(stats.earnings_yocto, "25000000000000000000000");
    }

    #[test]
    fn tied_vote_has_no_exile_and_starts_next_round() {
        let mut contract = new_contract();
        let players = create_and_fill(&mut contract);
        start(&mut contract, &players);
        describe_all(&mut contract, &players);

        // Two votes for host, two for p1, one for p3: no unique maximum.
        let targets = [
            account("p1.testnet"),
            account("host.testnet"),
            account("host.testnet"),
            account("p1.testnet"),
            account("p3.testnet"),
        ];
        for (index, player) in players.iter().enumerate() {
            testing_env!(ctx(player.as_str(), 0, 1_030 + index as u64));
            contract.commit_vote(
                "room-1".into(),
                hash_commitment(targets[index].as_str(), &format!("vote-{player}")),
            );
        }
        for (index, player) in players.iter().enumerate() {
            testing_env!(ctx(player.as_str(), 0, 1_040 + index as u64));
            contract.reveal_vote(
                "room-1".into(),
                targets[index].clone(),
                format!("vote-{player}"),
            );
        }

        let room = contract.get_room("room-1".into());
        assert_eq!(room.phase, Phase::RoleReveal);
        assert_eq!(room.pending_exile, None);

        testing_env!(ctx("p1.testnet", 0, 1_050));
        contract.advance("room-1".into());

        let room = contract.get_room("room-1".into());
        assert_eq!(room.phase, Phase::Describing);
        assert_eq!(room.round, 2);
        assert!(room.exiles.is_empty());
    }

    #[test]
    #[should_panic(expected = "Vote reveal does not match commitment")]
    fn wrong_vote_reveal_panics() {
        let mut contract = new_contract();
        let players = create_and_fill(&mut contract);
        start(&mut contract, &players);
        describe_all(&mut contract, &players);
        commit_all(&mut contract, &players, &account("host.testnet"));

        testing_env!(ctx("p1.testnet", 0, 1_040));
        contract.reveal_vote(
            "room-1".into(),
            account("p2.testnet"),
            "vote-p1.testnet".into(),
        );
    }

    #[test]
    #[should_panic(expected = "Only the game master")]
    fn only_game_master_can_start() {
        let mut contract = new_contract();
        let players = create_and_fill(&mut contract);
        let commitments: Vec<(AccountId, String)> = players
            .iter()
            .map(|player| (player.clone(), hash_commitment("crew", "salt")))
            .collect();
        testing_env!(ctx("host.testnet", 0, 1_010));
        contract.start_game("room-1".into(), commitments, vec![]);
    }

    #[test]
    fn lobby_refund_after_deadline() {
        let mut contract = new_contract();
        testing_env!(ctx("host.testnet", STAKE, 1_001));
        contract.create_room("room-1".into(), U128(STAKE), 2, 1, 3);

        testing_env!(ctx("host.testnet", 0, 1_001 + LOBBY_SECONDS));
        contract.refund("room-1".into());

        let room = contract.get_room("room-1".into());
        assert_eq!(room.phase, Phase::Refunded);
        assert_eq!(room.pot, "0".to_string());
    }
}
